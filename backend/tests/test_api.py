"""API tests (no API key needed: the server falls back to rules mode)."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def no_api_key(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)


def test_health_reports_rules_only_without_key():
    r = client.get("/api/health").json()
    assert r["ok"] and r["modes"] == ["rules"] and not r["llm_available"]


def test_drafts_lists_all_incoming_but_not_demo_uploads():
    drafts = client.get("/api/drafts").json()
    assert len(drafts) == 13
    assert not any("gulf_crown" in d["filename"] or "harrington_health_msa" in d["filename"] for d in drafts)


def test_demo_upload_is_not_a_named_draft():
    r = client.post("/api/analyze", json={"draft": "2026-09-18_gulf_crown_hotels_msa_draft.md"})
    assert r.status_code == 404


def test_analyze_uploaded_demo_contract_returns_sections():
    text = open("data/demo_uploads/2026-09-18_gulf_crown_hotels_msa_draft.md", encoding="utf-8").read()
    r = client.post("/api/analyze/upload", files={"file": ("2026-09-18_gulf_crown_hotels_msa_draft.md", text.encode(), "text/markdown")},
                    data={"mode": "judge"}).json()
    assert r["mode"] == "rules"  # downgraded: no key
    assert r["verdict_level"] == "blockers"
    sections = {f["section"] for f in r["findings"]}
    assert {"rules", "commitments"} <= sections
    assert any("Al Noor" in f["title"] for f in r["findings"] if f["section"] == "commitments")


def test_analyze_pasted_text_and_upload():
    text = open("data/incoming/2026-09-25_finserve_capital_mutual_nda_draft.md", encoding="utf-8").read()
    pasted = client.post("/api/analyze", json={"text": text, "filename": "finserve.md"}).json()
    assert any("Mutual" in f["title"] for f in pasted["findings"])
    up = client.post("/api/analyze/upload", files={"file": ("finserve.txt", text.encode(), "text/plain")}, data={"mode": "rules"})
    assert up.status_code == 200 and up.json()["counts"] == pasted["counts"]


def test_bad_requests():
    assert client.post("/api/analyze", json={}).status_code == 400
    assert client.post("/api/analyze", json={"draft": "nope.md"}).status_code == 404
    assert client.post("/api/analyze/upload", files={"file": ("x.exe", b"MZ", "application/octet-stream")}).status_code == 415


def test_register_and_queue():
    reg = client.get("/api/register").json()
    assert any(e["id"] == "REG-01" and e["active"] for e in reg)
    queue = client.get("/api/queue").json()
    assert queue[0]["deadline"] is not None and "Harrington" in queue[0]["counterparty"]
