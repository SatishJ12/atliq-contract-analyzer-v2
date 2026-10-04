"""Write the static JSON the React app uses in demo mode (no backend needed).

    python -m backend.export_demo            # writes frontend/public/demo/

Every incoming draft gets its real deterministic review (rules, commitment
register, completeness). Drafts with an entry in demo_judge_samples.json also
get an LLM-as-Judge section, run through the same quote check and merge code as
the live pipeline and labelled as an illustrative sample.
"""
from __future__ import annotations

import json
from pathlib import Path

from . import core
from .judge import JudgeResult, apply_to_report, combine
from analyzer import EXTRACT_MODEL, REVIEW_MODEL, analyze
from data_loader import DATASET_TODAY, list_incoming, read_text

OUT = core.ROOT / "frontend" / "public" / "demo"
SAMPLES = Path(__file__).with_name("demo_judge_samples.json")


def build() -> int:
    samples = json.loads(SAMPLES.read_text(encoding="utf-8"))
    (OUT / "reports").mkdir(parents=True, exist_ok=True)
    for path in list_incoming():
        text = read_text(path)
        report = analyze(text, path.name, use_llm=False)
        sample = samples.get(path.name)
        result = None
        if sample:
            j = sample["judgement"]
            result = JudgeResult(EXTRACT_MODEL, REVIEW_MODEL, j["summary"], j["questions_for_karandeep"],
                                 combine(text, sample["proposals"], j))
            unverified = [f.id for f in result.findings if not f.verified]
            assert not unverified, f"{path.name}: sample quotes not found in the draft: {unverified}"
            apply_to_report(report, result)
        out = core.report_to_dict(report)
        if result:
            out["findings"] = [f for f in out["findings"] if f["section"] != core.SECTION_AI]
            out["judge"] = result.to_dict() | {"sample": True}
        out["mode"] = "demo"
        (OUT / "reports" / f"{path.stem}.json").write_text(json.dumps(out, indent=1, default=str), encoding="utf-8")
    drafts = core.list_drafts()
    for d in drafts:
        d["has_judge_sample"] = d["filename"] in samples
    (OUT / "drafts.json").write_text(json.dumps(drafts, indent=1), encoding="utf-8")
    (OUT / "register.json").write_text(json.dumps(core.register_entries(), indent=1), encoding="utf-8")
    (OUT / "queue.json").write_text(json.dumps(core.contract_queue(), indent=1, default=str), encoding="utf-8")
    (OUT / "health.json").write_text(json.dumps({"ok": True, "llm_available": False, "modes": ["demo"],
                                                 "extractor_model": EXTRACT_MODEL, "judge_model": REVIEW_MODEL,
                                                 "dataset_today": DATASET_TODAY.isoformat()}, indent=1), encoding="utf-8")
    print(f"Wrote demo data for {len(drafts)} drafts to {OUT}")
    return len(drafts)


if __name__ == "__main__":
    build()
