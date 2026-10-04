# Contributing to the AtliQ Contract Risk Analyzer

Welcome. This guide gets you from a fresh clone to a new contract rule with a passing test. Read the
[README](../README.md) first for what the product does and who it is for (Karandeep, AtliQ's CEO, who signs
every contract himself with no legal team).

## 1. Overview

Every review runs the same pipeline. The deterministic layers always run and need no API key; the LLM layer
adds judgement on top and never replaces them.

```
contract text
   │
   ├─ rules.py          profile_document()  → who is AtliQ, which entity, buyer/supplier, governing law, clauses
   │                    run_rules()         → Karandeep's checklist as code (ALL_CHECKS)
   ├─ commitments.py    check_commitments() → conflicts with what AtliQ already signed (commitment_register.json)
   ├─ completeness.py   check_completeness()→ is the document set complete? (BAA for PHI, DPA for EU, ...)
   │
   │   analyzer.analyze() stitches the above into a Report and sets the verdict
   │
   └─ backend/judge.py  optional, needs GROQ_API_KEY
                        Stage 1 extractor (llama-3.1-8b-instant) proposes extra findings with verbatim quotes
                        Stage 2 judge (qwen/qwen3-32b) confirms, escalates or dismisses each one
```

| File | What lives there |
| --- | --- |
| `rules.py` | `Finding`, `DocProfile`, profiling, and the individual `check_*` functions |
| `commitments.py` | Register-driven checks (non-competes, MFN, exclusivity) |
| `completeness.py` | Required-document checks for the deal |
| `analyzer.py` | `analyze()`, the verdict, the shared LLM system prompt |
| `backend/judge.py` | The two-stage LLM-as-Judge review |
| `backend/main.py` | FastAPI app (`/api/analyze`, `/api/ask`, auth and rate limits) |
| `frontend/` | React + Vite UI |
| `data/` | The synthetic dataset (today is 28 Sep 2026 in this world) |
| `tests/test_golden_cases.py` | Golden tests: the known problems in the 15 incoming drafts |
| `backend/tests/` | API, judge and regression tests (LLM calls use a fake client) |

## 2. Adding a deterministic rule

Prefer a deterministic rule whenever the risk can be spotted from the text with a pattern: a number over a
threshold, a missing clause, a forbidden phrase. Rules are free, instant, testable and always quote their clause.

### Step 1: write the check in `rules.py`

Add a function in the "Individual checks" section. It takes the `DocProfile` (and optionally the full text) and
returns a list of `Finding`s. Loop over `p.clauses`; each clause has `ref`, `heading` and `text`.

```python
def check_auto_renewal(p: DocProfile) -> list[Finding]:
    out = []
    for c in p.clauses:
        t = c.text.lower()
        if "automatically renew" in t and not re.search(r"\b\d+\s+days'? (?:prior )?(?:written )?notice", t):
            out.append(Finding("Termination", "Medium", "Auto-renewal with no notice window",
                               "The contract renews by itself and gives AtliQ no deadline to opt out.",
                               "Add: either party may stop renewal with 60 days' written notice before the term ends.",
                               clause_ref=c.ref, quote=_short(c.text)))
    return out
```

Conventions:

- **Category**: reuse an existing one (`Liability`, `Payment`, `IP`, `Termination`, `Entity`, ...). The full list is
  `CATEGORIES` in `backend/judge.py`; the UI groups findings by it.
- **Severity**: `High` blocks signing, `Medium` should be negotiated, `Low` is worth knowing, `Info` is context.
  Don't inflate: a standard clause that only looks risky gets `Low` and a title that says so.
- **Explanation** is one or two plain sentences Karandeep can read on his phone. **Suggestion** is one concrete
  counter-position, not "consider reviewing".
- **Always quote**: set `clause_ref=c.ref` and `quote=_short(c.text)` so the reviewer can check it in seconds.
- **AtliQ as buyer**: when `p.atliq_role == "buyer"`, prefix the title with `"Fairness: "` (see
  `check_termination`). AtliQ holds its own templates to the standard it wants from clients.
- Use the helpers at the top of the file (`_has`, `_days_values`, `_num_in_parens`, `_short`) before writing new
  regex.

### Step 2: register it

Append the function to `ALL_CHECKS` at the bottom of `rules.py`. `run_rules()` calls it with `(profile, text)` if it
takes two arguments and `(profile)` otherwise, and turns any exception into an `Info` finding, so a broken rule
never breaks a report.

If the rule is about something AtliQ **already signed** (a non-compete, exclusivity, MFN), it belongs in the
register instead: add an entry to `commitment_register.json` (with `triggers.keywords`) and, if keywords are not
enough, a dedicated function in `commitments.py` wired up through `DISPATCH`. If it is about a **missing document**,
add it to `check_completeness()` in `completeness.py`.

### Step 3: add a golden test in `tests/test_golden_cases.py`

Golden tests run the real pipeline on a real draft from `data/incoming/` with `use_llm=False`. Use the `run()` and
`titles()` helpers:

```python
def test_<draft>_auto_renewal_without_notice():
    r = run("<draft>")                        # any unique part of a file name in data/incoming/
    assert "Auto-renewal with no notice window" in titles(r, severity="Medium")
```

None of the current drafts has an auto-renewal clause, so the example above is illustrative. If no existing draft has the clause, add a small new draft to `data/incoming/` (and a tracker row in
`data/contract_tracker.csv` if the rule depends on tracker data). Also make sure
`test_clean_documents_have_no_blockers` still passes: a new rule must not fire on clean documents.

### Step 4: refresh the offline demo

The GitHub Pages site serves pre-computed reports. Regenerate them so the demo shows your rule:

```bash
python -m backend.export_demo        # writes frontend/public/demo/
```

## 3. Adding an LLM rule

Use the LLM layer when the risk depends on **reading in context** rather than matching a pattern:

| Deterministic rule | LLM (judge) |
| --- | --- |
| "LDs over 10% of fees" | "these two clauses together make the LD cap meaningless" |
| "governing law is not India/US" | "this indemnity is unusual for a pilot of this size" |
| "no BAA in the document set" | "the counterparty's wording hides a non-compete in the NDA's confidentiality clause" |

The LLM layer is steered by prompts, not code:

- **What AtliQ cares about** comes from `analyzer.SYSTEM_PROMPT`, which also injects the playbook
  (`data/karandeep_contract_checklist.md`, `data/atliq_entities.md`, `data/negotiation_notes.md`) and the commitment
  register. To teach the reviewer a new rule, add it to the checklist file; it then reaches every LLM call.
- **How each stage behaves** is in `EXTRACTOR_INSTRUCTIONS` and `JUDGE_INSTRUCTIONS` in `backend/judge.py`. Keep
  these short and don't repeat what `SYSTEM_PROMPT` already says.
- **Output shape** is fixed by `EXTRACT_SCHEMA` / `JUDGE_SCHEMA`; `analyzer.conform()` drops anything that does not
  match. A new category must be added to `CATEGORIES` and to the `REVIEW_SCHEMA` enum in `analyzer.py`.

Things to keep in mind:

- **Token budget.** Each stage already sends ~8k-14k input tokens (playbook + register + contract). Groq's free tier
  allows ~6,000 tokens per minute, so the free tier falls back to rules; every token you add to the prompts costs
  on every review. See the comment above `EXTRACTOR_INSTRUCTIONS`.
- **Quotes are verified.** Findings whose quote is not in the contract are marked "Needs Human Review" and
  downgraded. Don't relax this.
- **The contract is untrusted input.** It is fenced in a random tag, and text addressed to the reviewer is reported
  as a High finding. Never move contract text into the system prompt.
- **Test with the fake client.** `backend/tests/test_judge.py` shows how to drive `judge_review()` with canned
  responses, so tests never call Groq. Add a case for the behaviour you changed.

## 4. Running tests locally

```bash
# Python (from the repo root)
pip install -r requirements.txt -r backend/requirements.txt pytest httpx
python -m pytest -q                  # golden + backend tests; no API key needed

# Frontend
cd frontend
npm ci
npm test                             # Vitest
npm run typecheck
```

To run the app:

```bash
uvicorn backend.main:app --reload    # API on http://127.0.0.1:8000/docs
cd frontend && npm run dev           # UI on http://localhost:5173
```

CI (`.github/workflows/deploy.yml`) runs the same Python and frontend tests on every push, then deploys the
offline demo to GitHub Pages. Run the tests before you push.

## 5. Environment setup

None of these are needed for rules mode or the tests. Set them on the backend only, never in a `VITE_` variable
(those ship to the browser).

| Variable | Needed for | Default |
| --- | --- | --- |
| `GROQ_API_KEY` | AI modes (`single`, `judge`) and Ask. Without it the API offers rules mode only. | unset |
| `ATLIQ_ACCESS_TOKEN` | Guards the AI modes and Ask; callers send it in the `X-Access-Token` header (the site's ⚙ settings). Render generates one. Set it on any public deployment. | unset = no check |
| `ATLIQ_EXTRACT_MODEL` | Stage 1 model | `llama-3.1-8b-instant` |
| `ATLIQ_REVIEW_MODEL` | Stage 2 judge and single-pass model | `qwen/qwen3-32b` |
| `ATLIQ_ASK_MODEL` | Ask-a-question model | `llama-3.3-70b-versatile` |
| `ATLIQ_RATE_LIMIT_PER_HOUR` | AI runs per IP per hour | `10` |
| `ATLIQ_DAILY_LLM_LIMIT` | AI runs per day before falling back to rules | `200` |
| `ATLIQ_CORS_ORIGINS` | Comma-separated allowed origins | the GitHub Pages site |

For the frontend, copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_URL` to your backend URL, or
leave it empty to run the static offline demo.

For local work, export the key in your shell (`export GROQ_API_KEY=...`). The Streamlit app (`app.py`) also reads
`GROQ_API_KEY` from Streamlit secrets. Never commit a key.
