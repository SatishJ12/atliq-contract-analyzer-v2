"""Regression tests for the 6 Oct 2026 code review findings that are specific to the v2 backend."""
import asyncio

from fastapi.testclient import TestClient

import analyzer
from backend import main
from backend.judge import combine
from backend.tests.test_review_fixes import AUTH, GULF_TEXT, LOOPMART, Fake, _f, fake  # noqa: F401  (fixture)
from data_loader import DEMO_UPLOADS_DIR, read_text
from rules import profile_document

client = TestClient(main.app)
FAKE_QUOTE = "AtliQ shall pay a penalty of one million dollars per day."


def test_unverified_quote_downgrade_matches_single_mode():
    proposals = [dict(_f("Liability", sev, f"t{sev}", str(i), FAKE_QUOTE), id=f"s1-{i}")
                 for i, sev in enumerate(["High", "Medium", "Low"], 1)]
    rulings = [{"finding_id": p["id"], "verdict": "confirm", "final_severity": p["severity"], "reasoning": "ok", "precedent": ""}
               for p in proposals]
    out = {f.stage1_id: f.final_severity for f in combine(GULF_TEXT, proposals, {"rulings": rulings})}
    assert out == {"s1-1": "Medium", "s1-2": "Low", "s1-3": "Low"}


def test_single_mode_unverified_medium_becomes_low(fake):
    fake.single = {"summary": "s", "questions_for_karandeep": [], "findings": [
        dict(_f("Payment", "Medium", "Invented", "4.2", FAKE_QUOTE), precedent="")]}
    r = analyzer.analyze(GULF_TEXT, "gulf.md", use_llm=True)
    f = next(f for f in r.findings if f.source == "llm")
    assert not f.verified and f.severity == "Low" and f.title.startswith("[Unverified quote]")


def test_nda_prompt_carries_only_the_relevant_register_entries():
    nda = read_text(LOOPMART)
    p = profile_document(nda)
    ids = [e["id"] for e in analyzer.relevant_register(p, nda)]
    assert ids == ["REG-09", "REG-12"]
    assert len(analyzer.system_prompt(p, nda)) < len(analyzer.system_prompt()) - 4000
    msa = read_text(next(DEMO_UPLOADS_DIR.glob("*gulf_crown*")))
    assert len(analyzer.relevant_register(profile_document(msa), msa)) == len(analyzer.relevant_register())


def test_judge_stages_send_the_filtered_register(fake):
    nda = read_text(LOOPMART)
    client.post("/api/analyze", json={"text": nda, "filename": LOOPMART.name, "mode": "judge"}, headers=AUTH)
    systems = [kw["messages"][0]["content"] for kw in fake.calls]
    assert systems and all("REG-09" in s and "REG-01" not in s for s in systems)


def test_wrong_token_is_rejected_and_right_token_accepted(fake):
    body = {"draft": LOOPMART.name, "mode": "single"}
    assert client.post("/api/analyze", json=body, headers={"X-Access-Token": "wrong"}).status_code == 401
    assert client.post("/api/analyze", json=body).status_code == 401
    assert client.post("/api/analyze", json=body, headers=AUTH).status_code == 200


def test_whitespace_text_is_a_400_not_a_crash():
    assert client.post("/api/analyze", json={"text": "   \n  ", "mode": "rules"}).status_code == 400


def test_upload_review_runs_off_the_event_loop(monkeypatch):
    seen = {}
    real = main._review

    def spy(*a, **kw):
        try:
            asyncio.get_running_loop()
            seen["on_loop"] = True  # called from the event-loop thread: would block every other request
        except RuntimeError:
            seen["on_loop"] = False  # a threadpool worker has no running loop
        return real(*a, **kw)

    monkeypatch.setattr(main, "_review", spy)
    text = read_text(LOOPMART)
    r = client.post("/api/analyze/upload", files={"file": ("loopmart.txt", text.encode(), "text/plain")}, data={"mode": "rules"})
    assert r.status_code == 200
    assert seen["on_loop"] is False
