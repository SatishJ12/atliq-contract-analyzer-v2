"""LLM-as-Judge pipeline with a fake Groq client (no network)."""
import json
from types import SimpleNamespace

from backend.core import report_to_dict
from backend.judge import EXTRACT_SCHEMA, JUDGE_SCHEMA, judge_review
from analyzer import EXTRACT_MODEL, REASONING_MODEL_PREFIXES, REVIEW_MODEL, analyze
from data_loader import INCOMING_DIR, read_text

GULF = next(INCOMING_DIR.glob("*gulf_crown*"))
REAL_QUOTE = "In the event of any inconsistency, the Arabic text shall prevail."
WARRANTY = "it is not bound by any agreement or restriction which would prevent or restrict it from performing the Services for the Company."


def _f(cat, sev, title, ref, quote):
    return {"category": cat, "severity": sev, "title": title, "clause_ref": ref, "quote": quote,
            "explanation": "x", "suggestion": "y"}


STAGE1 = {"findings": [
    _f("Other", "Medium", "Arabic prevails", "15.3", REAL_QUOTE),
    _f("Restrictive covenant", "Medium", "No-conflict warranty", "9.1(d)", WARRANTY),
    _f("NDA", "Low", "Five-year survival", "7.3", "The obligations in this Clause 7 shall survive for a period of five (5) years"),
    _f("Liability", "High", "Invented clause", "99", "AtliQ shall pay unlimited damages for everything."),
]}
STAGE2 = {"summary": "s", "questions_for_karandeep": ["q"], "rulings": [
    {"finding_id": "s1-1", "verdict": "confirm", "final_severity": "Medium", "reasoning": "ok", "precedent": ""},
    {"finding_id": "s1-2", "verdict": "escalate", "final_severity": "High", "reasoning": "Al Noor", "precedent": ""},
    {"finding_id": "s1-3", "verdict": "dismiss", "final_severity": "Low", "reasoning": "standard", "precedent": ""},
    # s1-4 deliberately left without a ruling
]}


class FakeCompletions:
    def __init__(self):
        self.calls = []

    def create(self, **kw):
        self.calls.append(kw)
        body = STAGE1 if kw["model"] == EXTRACT_MODEL else STAGE2
        msg = SimpleNamespace(content=json.dumps(body))
        return SimpleNamespace(choices=[SimpleNamespace(finish_reason="stop", message=msg)])


def fake_client(completions):
    return SimpleNamespace(chat=SimpleNamespace(completions=completions))


def run():
    completions = FakeCompletions()
    text = read_text(GULF)
    report = analyze(text, GULF.name, use_llm=False)
    highs_before = report.counts()["High"]
    result = judge_review(text, report, client=fake_client(completions))
    return completions.calls, report, result, highs_before


def test_two_stages_use_the_right_models_and_schemas():
    calls, *_ = run()
    assert [c["model"] for c in calls] == [EXTRACT_MODEL, REVIEW_MODEL]
    assert all(c["response_format"] == {"type": "json_object"} for c in calls)
    assert json.dumps(EXTRACT_SCHEMA) in calls[0]["messages"][0]["content"]  # schema travels in the system prompt
    assert json.dumps(JUDGE_SCHEMA) in calls[1]["messages"][0]["content"]
    assert "reasoning_format" not in calls[0]  # Groq rejects it on non-reasoning models (Llama)
    assert calls[1].get("reasoning_format") == ("hidden" if REVIEW_MODEL.startswith(REASONING_MODEL_PREFIXES) else None)
    assert "s1-1" in calls[1]["messages"][1]["content"]  # judge sees Stage 1 ids


def test_verdicts_and_human_review_flags():
    _, _, result, _ = run()
    by = {f.stage1_id: f for f in result.findings}
    assert by["s1-1"].judge_verdict == "confirm" and not by["s1-1"].needs_human_review
    assert by["s1-2"].judge_verdict == "escalate" and by["s1-2"].final_severity == "High" and by["s1-2"].needs_human_review
    assert by["s1-3"].judge_verdict == "dismiss" and by["s1-3"].needs_human_review and not by["s1-3"].counts_toward_verdict
    s4 = by["s1-4"]
    assert s4.judge_verdict == "not_reviewed" and not s4.verified and s4.final_severity == "Medium"
    assert "Quote not found in the contract" in s4.review_reasons
    assert result.findings[0].needs_human_review  # disagreements sort first


def test_report_verdict_counts_escalated_but_not_dismissed():
    _, report, result, highs_before = run()
    assert report.llm_used and report.llm_summary == "s"
    assert report.counts()["High"] == highs_before + 1  # escalated warranty
    assert not any(f.title == "Five-year survival" for f in report.findings)
    d = result.to_dict()
    assert d["stats"] == {"confirm": 1, "escalate": 1, "dismiss": 1, "not_reviewed": 1, "needs_human_review": 3, "total": 4}
    assert report_to_dict(report)["counts"]["High"] == highs_before + 1


def test_api_failure_keeps_deterministic_report():
    class Boom:
        def create(self, **kw):
            raise RuntimeError("overloaded")

    text = read_text(GULF)
    report = analyze(text, GULF.name, use_llm=False)
    before = report.counts()
    result = judge_review(text, report, client=fake_client(Boom()))
    assert result.error and "overloaded" in report.llm_error and report.counts() == before
