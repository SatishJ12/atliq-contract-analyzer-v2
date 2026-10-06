"""AtliQ Contract Risk Analyzer API.

    uvicorn backend.main:app --reload          # from the repo root

Endpoints (all JSON):
    GET  /api/health                 which review modes are available
    GET  /api/drafts                 the 13 incoming drafts with deadline and High count
    POST /api/analyze                review an incoming draft or pasted text
    POST /api/analyze/upload         review an uploaded PDF / DOCX / TXT / MD file
    POST /api/ask                    question about a contract (needs GROQ_API_KEY)
    GET  /api/register               commitment register
    GET  /api/queue                  contracts waiting on Karandeep

The AI modes ("single", "judge") and /api/ask spend the Groq key (GROQ_API_KEY), so they are guarded:
    ATLIQ_ACCESS_TOKEN          if set, callers must send it in the X-Access-Token header (401 otherwise)
    ATLIQ_RATE_LIMIT_PER_HOUR   AI runs per client IP per hour (default 10; 429 when exceeded)
    ATLIQ_DAILY_LLM_LIMIT       AI runs per day for the whole server (default 200); after that, reviews fall back to rules
    ATLIQ_CORS_ORIGINS          comma-separated allowed origins (default: the GitHub Pages site and the Vite dev server)
Rules mode stays open. Request bodies are capped (contract text 200k characters, question 1,000).
"""
from __future__ import annotations

import copy
import hashlib
import logging
import os
import secrets
import threading
import time
from collections import OrderedDict, defaultdict, deque
from datetime import date
from typing import Literal

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from . import core
from .judge import judge_review
from analyzer import ASK_MODEL, EXTRACT_MODEL, REVIEW_MODEL, analyze, ask_about_contract, llm_available
from data_loader import DATASET_TODAY, extract_text_from_upload, read_text

log = logging.getLogger("atliq.api")

Mode = Literal["rules", "single", "judge"]
LLM_MODES = ("single", "judge")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_TEXT_CHARS = 200_000
MAX_PDF_PAGES = 150
DEFAULT_CORS = "https://satishj12.github.io,http://localhost:5173,http://127.0.0.1:5173"

app = FastAPI(title="AtliQ Contract Risk Analyzer API", version="2.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("ATLIQ_CORS_ORIGINS", DEFAULT_CORS).split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Access-Token"],
)


class AnalyzeRequest(BaseModel):
    draft: str | None = Field(None, max_length=200)        # filename of an incoming draft
    text: str | None = Field(None, max_length=MAX_TEXT_CHARS)  # or pasted contract text
    filename: str = Field("pasted contract", max_length=200)
    mode: Mode = "judge"


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1_000)
    draft: str | None = Field(None, max_length=200)
    text: str | None = Field(None, max_length=MAX_TEXT_CHARS)
    filename: str = Field("pasted contract", max_length=200)


# --------------------------------------------------------------------------- #
# Spend guard: access token, per-IP rate limit, daily budget
# --------------------------------------------------------------------------- #
class SpendGuard:
    def __init__(self):
        self._lock = threading.Lock()
        self._hits: dict[str, deque] = defaultdict(deque)
        self._day = date.today()
        self._today = 0

    @staticmethod
    def per_hour() -> int:
        return int(os.environ.get("ATLIQ_RATE_LIMIT_PER_HOUR", "10"))

    @staticmethod
    def per_day() -> int:
        return int(os.environ.get("ATLIQ_DAILY_LLM_LIMIT", "200"))

    def budget_left(self) -> bool:
        with self._lock:
            self._roll()
            return self._today < self.per_day()

    def take(self, ip: str) -> None:
        """Count one AI run for this IP, or raise 429."""
        now = time.monotonic()
        with self._lock:
            self._roll()
            hits = self._hits[ip]
            while hits and now - hits[0] > 3600:
                hits.popleft()
            if len(hits) >= self.per_hour():
                raise HTTPException(429, "Too many AI reviews from this address in the last hour. Rules mode still works.")
            hits.append(now)
            self._today += 1

    def _roll(self) -> None:
        if date.today() != self._day:
            self._day, self._today = date.today(), 0
            self._hits.clear()

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
            self._day, self._today = date.today(), 0


guard = SpendGuard()


def _client_ip(request: Request) -> str:
    # Render (one proxy hop) appends the caller's address last; earlier entries are client-supplied.
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def _check_token(token: str | None) -> None:
    expected = os.environ.get("ATLIQ_ACCESS_TOKEN")
    # constant-time comparison, so response timing does not leak how much of a guessed token was right
    if expected and not secrets.compare_digest((token or "").encode(), expected.encode()):
        raise HTTPException(401, "The AI modes need an access token. Add it in Settings, or use rules mode.")


# --------------------------------------------------------------------------- #
# Result cache: the same text in the same mode is not paid for twice
# --------------------------------------------------------------------------- #
_CACHE: OrderedDict[str, dict] = OrderedDict()
_CACHE_MAX = 64
_cache_lock = threading.Lock()


def _cache_key(text: str, filename: str, mode: str) -> str:
    return hashlib.sha256(f"{mode}|{EXTRACT_MODEL}|{REVIEW_MODEL}|{filename}|{text}".encode()).hexdigest()


def _cache_get(key: str) -> dict | None:
    with _cache_lock:
        hit = _CACHE.get(key)
        if hit is None:
            return None
        _CACHE.move_to_end(key)
        return copy.deepcopy(hit) | {"cached": True}


def _cache_put(key: str, value: dict) -> None:
    with _cache_lock:
        _CACHE[key] = copy.deepcopy(value)
        _CACHE.move_to_end(key)
        while len(_CACHE) > _CACHE_MAX:
            _CACHE.popitem(last=False)


# --------------------------------------------------------------------------- #
# Review
# --------------------------------------------------------------------------- #
def _resolve_text(draft: str | None, text: str | None, filename: str) -> tuple[str, str]:
    if draft:
        path = core.find_draft(draft)
        if not path:
            raise HTTPException(404, f"No incoming draft named {draft}")
        return read_text(path), path.name
    if text and text.strip():
        return text, filename
    raise HTTPException(400, "Send either a draft filename or contract text.")


def _review(text: str, filename: str, mode: Mode, request: Request, token: str | None) -> dict:
    if not text or not text.strip():
        raise HTTPException(400, "The contract text is empty.")
    notes = []
    if mode in LLM_MODES and not llm_available():
        mode = "rules"
    if mode in LLM_MODES:
        _check_token(token)
    key = _cache_key(text, filename, mode)
    cached = _cache_get(key)
    if cached is not None:
        return cached
    if mode in LLM_MODES:
        if guard.budget_left():
            guard.take(_client_ip(request))
        else:
            notes.append("Today's AI review budget is used up, so this ran in rules mode.")
            mode = "rules"
            key = _cache_key(text, filename, mode)

    report = analyze(text, filename, use_llm=(mode == "single"))
    result = judge_review(text, report) if mode == "judge" else None
    if report.llm_error:
        log.warning("AI review failed for %s (%s): %s", filename, mode, report.llm_error)
    out = core.report_to_dict(report)
    if result is not None:
        out["findings"] = [f for f in out["findings"] if f["section"] != core.SECTION_AI]
        out["judge"] = result.to_dict()
    out["mode"] = mode
    out["cached"] = False
    if len(text.strip()) < 200:
        notes.append("Very little text was found. If this is a scanned PDF it needs OCR first.")
    if notes:
        out["warning"] = " ".join(notes)
    if not report.llm_error:
        _cache_put(key, out)
    return out


@app.get("/api/health")
def health() -> dict:
    llm = llm_available()
    return {"ok": True, "llm_available": llm, "modes": ["rules", "single", "judge"] if llm else ["rules"],
            "token_required": llm and bool(os.environ.get("ATLIQ_ACCESS_TOKEN")),
            "extractor_model": EXTRACT_MODEL, "judge_model": REVIEW_MODEL, "ask_model": ASK_MODEL,
            "provider": "groq", "dataset_today": DATASET_TODAY.isoformat()}


@app.get("/api/drafts")
def drafts() -> list[dict]:
    return core.list_drafts()


@app.post("/api/analyze")
def analyze_contract(req: AnalyzeRequest, request: Request, x_access_token: str | None = Header(None)) -> dict:
    text, filename = _resolve_text(req.draft, req.text, req.filename)
    return _review(text, filename, req.mode, request, x_access_token)


@app.post("/api/analyze/upload")
async def analyze_upload(request: Request, file: UploadFile = File(...), mode: Mode = Form("judge"),
                         x_access_token: str | None = Header(None)) -> dict:
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is larger than 10 MB.")
    name = (file.filename or "upload")[:200]
    if not name.lower().endswith((".pdf", ".docx", ".txt", ".md")):
        raise HTTPException(415, "Upload a PDF, Word (.docx), .txt or .md file.")
    meta: dict = {}
    try:
        # pdfplumber and the AI calls (up to ~2 minutes each) block, so they run in the threadpool, not on the event loop
        text = await run_in_threadpool(extract_text_from_upload, name, data, max_pages=MAX_PDF_PAGES, meta=meta)
    except Exception:
        log.exception("Could not extract text from upload %s", name)
        raise HTTPException(422, "Could not read that file. Check it opens normally, or paste its text instead.") from None
    if not text.strip():
        raise HTTPException(422, "No text found in that file. If it is a scanned PDF it needs OCR first.")
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(413, f"That file has more than {MAX_TEXT_CHARS:,} characters of text. Upload the contract on its own.")
    out = await run_in_threadpool(_review, text, name, mode, request, x_access_token)
    if meta.get("truncated"):
        msg = f"Only the first {MAX_PDF_PAGES} of {meta['pages']} pages were read."
        out["warning"] = f"{out['warning']} {msg}" if out.get("warning") else msg
    out["text"] = text  # lets the browser ask questions about, or re-run, the uploaded file without re-uploading it
    return out


@app.post("/api/ask")
def ask(req: AskRequest, request: Request, x_access_token: str | None = Header(None)) -> dict:
    text, filename = _resolve_text(req.draft, req.text, req.filename)
    if llm_available():
        _check_token(x_access_token)
        if not guard.budget_left():
            raise HTTPException(429, "Today's AI budget is used up. Try again tomorrow.")
        guard.take(_client_ip(request))
    report = analyze(text, filename, use_llm=False)
    try:
        answer = ask_about_contract(req.question, text, report)
    except Exception:
        log.exception("Ask failed for %s", filename)
        raise HTTPException(502, "The AI service could not answer right now. Try again in a minute.") from None
    return {"answer": answer}


@app.get("/api/register")
def register() -> list[dict]:
    return core.register_entries()


@app.get("/api/queue")
def queue() -> list[dict]:
    return core.contract_queue()
