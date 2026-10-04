"""Glue between the existing review modules (repo root) and the API.

The deterministic layer (rules.py, commitments.py, completeness.py) and
analyzer.py stay where they are; this module only imports and serialises them.
"""
from __future__ import annotations

import hashlib
import re
import sys
from dataclasses import asdict
from datetime import date
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from analyzer import Report, analyze, is_critical  # noqa: E402
from data_loader import DATASET_TODAY, list_incoming, load_register, load_tracker, read_text  # noqa: E402

ACRONYMS = {"Msa": "MSA", "Sow2": "SOW-2", "Nda": "NDA", "Baa": "BAA"}
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}

# Which UI section each finding belongs to.
SECTION_RULES = "rules"
SECTION_COMMITMENTS = "commitments"
SECTION_COMPLETENESS = "completeness"
SECTION_AI = "ai"


def pretty(name: str) -> str:
    return " ".join(ACRONYMS.get(w, w) for w in name.title().split())


def deadline_from_notes(notes: str) -> date | None:
    m = re.search(r"(?:by|before)\s+(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(\d{1,2})\s+"
                  r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", (notes or "").lower())
    if not m:
        return None
    month, day = MONTHS[m.group(2)], int(m.group(1))
    # Notes give no year: take the dataset year, or the next one if that date is long past ("by 5 Jan" written in September).
    try:
        dl = date(DATASET_TODAY.year, month, day)
        if (DATASET_TODAY - dl).days > 180:
            dl = date(DATASET_TODAY.year + 1, month, day)
    except ValueError:  # "31 sep"
        return None
    return dl


def draft_label(path: Path) -> str:
    return pretty(path.stem.split("_", 1)[1].replace("_draft", "").replace("_", " "))


def report_deadline(report: Report) -> date | None:
    dl = None
    for r in report.tracker:
        dl = deadline_from_notes(r.get("notes", "")) or dl
    return dl


def section_of(f) -> str:
    if f.source in ("llm", "claude"):  # "claude" in reports saved before the switch to Groq
        return SECTION_AI
    if f.category == "Prior commitment" or f.source == "register":
        return SECTION_COMMITMENTS
    if f.category == "Completeness":
        return SECTION_COMPLETENESS
    return SECTION_RULES


def _clean(v):
    """Make pandas/NaN values JSON-safe."""
    if isinstance(v, float) and v != v:
        return None
    return v


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def finding_id(kind: str, category: str, clause_ref: str, title: str, taken: set[str]) -> str:
    """Id that depends on what the finding is, not where it lands in the list, so decisions stay attached across re-runs."""
    base = hashlib.sha1(f"{category}|{clause_ref}|{title}".encode()).hexdigest()[:10]
    fid = f"{kind[0]}-{base}"
    n = 2
    while fid in taken:  # two findings with the same category, clause and title
        fid = f"{kind[0]}-{base}-{n}"
        n += 1
    taken.add(fid)
    return fid


def report_to_dict(report: Report) -> dict:
    p = report.profile
    dl = report_deadline(report)
    findings = []
    taken: set[str] = set()
    for f in report.findings:
        d = asdict(f)
        d["id"] = finding_id("finding", f.category, f.clause_ref, f.title, taken)
        d["section"] = section_of(f)
        d["critical"] = is_critical(f.category, f.severity, f.title)
        findings.append(d)
    return {
        "filename": report.filename,
        "counterparty": report.tracker[0]["counterparty"] if report.tracker else "",
        "title": p.title.title() if p.title.isupper() else p.title,
        "profile": {
            "doc_type": p.doc_type, "is_nda": p.is_nda, "atliq_entity": p.atliq_entity,
            "atliq_role": p.atliq_role, "counterparty_country": p.counterparty_country,
            "governing_law": p.governing_law,
        },
        "tracker": [{k: _clean(v) for k, v in row.items()} for row in report.tracker],
        "verdict": report.verdict,
        "verdict_level": report.verdict_level,
        "escalate": report.escalate,
        "counts": report.counts(),
        "value_usd": report.value_usd,
        "deadline": dl.isoformat() if dl else None,
        "days_left": (dl - DATASET_TODAY).days if dl else None,
        "findings": findings,
        "required_docs": report.required_docs,
        "bundle": [{k: _clean(v) for k, v in row.items()} for row in report.bundle],
        "precedents": report.precedents,
        "context_notes": [{"name": n, "body": b} for n, b in report.context_notes],
        "llm_summary": report.llm_summary,
        "llm_questions": report.llm_questions,
        "llm_used": report.llm_used,
        "llm_error": report.llm_error_public or ("The AI review failed for this run." if report.llm_error else ""),
        "judge": None,
    }


def find_draft(filename: str) -> Path | None:
    for p in list_incoming():
        if p.name == filename:
            return p
    return None


@lru_cache(maxsize=1)
def _scan_incoming() -> tuple[tuple[Path, Report], ...]:
    """Rules-only scan of every incoming draft. The dataset is static, so this runs once per process."""
    return tuple((p, analyze(read_text(p), p.name, use_llm=False)) for p in list_incoming())


@lru_cache(maxsize=1)
def _list_drafts() -> tuple[dict, ...]:
    out = []
    for p, r in _scan_incoming():
        dl = report_deadline(r)
        out.append({"filename": p.name, "label": draft_label(p), "deadline": dl.isoformat() if dl else None,
                    "high": r.counts()["High"], "verdict_level": r.verdict_level})
    return tuple(out)


def list_drafts() -> list[dict]:
    return [dict(d) for d in _list_drafts()]


def register_entries() -> list[dict]:
    out = []
    for e in load_register():
        active = (not e.get("ends")) or date.fromisoformat(e["ends"]) >= DATASET_TODAY
        out.append({k: v for k, v in e.items() if k != "triggers"} | {"active": active})
    return out


def contract_queue() -> list[dict]:
    return [dict(r) for r in _contract_queue()]


@lru_cache(maxsize=1)
def _contract_queue() -> tuple[dict, ...]:
    """Tracker rows waiting on Karandeep with a rules-only scan of the matching draft (same logic as the Streamlit tab)."""
    tr = load_tracker()
    q = tr[tr["status"].isin(["In review", "Draft", "", "Awaiting client"])].copy()
    scans: dict[str, Report] = {}
    for _, r in _scan_incoming():
        dt = r.profile.doc_type
        for t in r.tracker:
            if t["status"] == "Signed":
                continue
            row_type = t["doc_type"].lower()
            if "BAA" in dt:
                ok = "baa" in row_type
            elif r.profile.is_nda:
                ok = "nda" in row_type
            elif "Contractor" in dt:
                ok = "contractor" in row_type
            else:
                ok = "baa" not in row_type and "nda" not in row_type
            if ok:
                scans[t["contract_id"]] = r
    rows = []
    for _, row in q.iterrows():
        cid = row["contract_id"]
        dl = deadline_from_notes(row["notes"])
        scan = scans.get(cid)
        rows.append({
            "contract_id": cid, "counterparty": row["counterparty"], "doc_type": row["doc_type"],
            "atliq_entity": row["atliq_entity"], "client_country": row["client_country"],
            "value_usd": _num(row["value_usd"]), "status": row["status"], "notes": row["notes"],
            "deadline": dl.isoformat() if dl else None,
            "high": scan.counts()["High"] if scan else None,
            "scan_verdict": scan.verdict if scan else "No draft in dataset",
            "scan_level": scan.verdict_level if scan else None,
            "draft": scan.filename if scan else None,
        })
    rows.sort(key=lambda r: (r["deadline"] is None, r["deadline"] or ""))
    return tuple(rows)
