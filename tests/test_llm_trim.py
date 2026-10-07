"""The contract sent to Groq is capped (~4k tokens); the deterministic checks still see the full text."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import analyzer  # noqa: E402
from analyzer import LLM_CONTRACT_CHAR_LIMIT, TRUNCATION_NOTE, analyze, fence_contract, trim_for_llm  # noqa: E402
from data_loader import DEMO_UPLOADS_DIR, read_text  # noqa: E402


def test_short_text_is_sent_unchanged():
    assert trim_for_llm("clause 1. short") == "clause 1. short"


def test_long_text_is_cut_and_labelled():
    out = trim_for_llm("x" * (LLM_CONTRACT_CHAR_LIMIT + 5000))
    assert out.endswith(TRUNCATION_NOTE)
    assert len(out) <= LLM_CONTRACT_CHAR_LIMIT + len(TRUNCATION_NOTE) + 2


def test_fenced_contract_is_trimmed():
    fenced = fence_contract("y" * (LLM_CONTRACT_CHAR_LIMIT * 2))
    assert TRUNCATION_NOTE in fenced and fenced.split(TRUNCATION_NOTE)[0].count("y") == LLM_CONTRACT_CHAR_LIMIT


def test_rules_still_read_the_full_text_past_the_cap(monkeypatch):
    text = read_text(next(DEMO_UPLOADS_DIR.glob("*harrington_health_msa*")))
    assert len(text) > LLM_CONTRACT_CHAR_LIMIT  # the Harrington MSA is ~22k chars
    full = analyze(text, "harrington.md", use_llm=False)
    monkeypatch.setattr(analyzer, "LLM_CONTRACT_CHAR_LIMIT", 100)
    again = analyze(text, "harrington.md", use_llm=False)
    assert [f.title for f in full.findings] == [f.title for f in again.findings]
