# AtliQ Contract Risk Analyzer (Deliverable 5)

Tells AtliQ's CEO, before he signs, what a contract really commits AtliQ to: risky clauses against his own playbook, the wrong entity or governing law, conflicts with obligations AtliQ has **already signed**, missing documents (BAA, DPA, subcontractor BAAs), and unfair terms when AtliQ is the buyer.

Version 2 replaces the Streamlit UI with a **React** front end and a **FastAPI** backend, and replaces the single Claude call with a two-stage **LLM-as-Judge** review. The deterministic engine (`rules.py`, `commitments.py`, `completeness.py`) is unchanged. Since 4 Oct 2026 the AI layer runs on Groq (Llama + Qwen models) instead of Anthropic Claude; see "API key and models" below.

Built on the synthetic AtliQ dataset (dataset "today" = 28 Sep 2026). Not legal advice.

## Architecture

```
                     ┌──────────────────────────────────────────────┐
  Browser            │ frontend/  React + Vite + TypeScript         │
  (GitHub Pages)     │ Tailwind + shadcn/ui components              │
                     │  Review · Register · Queue · How it works    │
                     └───────────────┬───────────────┬──────────────┘
                        VITE_API_URL │ set           │ not set / unreachable
                                     ▼               ▼
  ┌──────────────────────────────────────────┐   ┌─────────────────────────────┐
  │ backend/  FastAPI (Render / Railway)     │   │ frontend/public/demo/*.json │
  │  /api/analyze  /api/analyze/upload       │   │ offline demo, exported from │
  │  /api/drafts /api/register /api/queue    │   │ the same pipeline by        │
  │  /api/ask    /api/health                 │   │ backend/export_demo.py      │
  └───────────────┬──────────────────────────┘   └─────────────────────────────┘
                  ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ analyzer.py: profile ─► rules.py ─► commitments.py ─► completeness.py    │
  │              (deterministic, no API key, quotes every clause)            │
  └───────────────┬──────────────────────────────────────────────────────────┘
                  ▼  mode = "judge" and GROQ_API_KEY set
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ backend/judge.py                                                         │
  │  Stage 1  Extractor  llama-3.1-8b-instant  proposes findings + quotes    │
  │  Stage 2  Judge      qwen/qwen3-32b     confirm / escalate / dismiss     │
  │  Code     quote string-match · disagreement ─► "Needs Human Review"      │
  │           dismissed findings stay visible, stop counting toward verdict  │
  └───────────────┬──────────────────────────────────────────────────────────┘
                  ▼
        verdict · counsel escalation · review brief · decision log
```

## What it does

| Feature (PRD ref) | How it works | Needs API key? |
|---|---|---|
| **Commitment register** (F1) | 12 obligations extracted from the 17 signed contracts, each with a verbatim quote, who it binds, and when it ends (`commitment_register.json`). `build_register.py` shows how an LLM re-extracts it. | No |
| **Conflict check** (F2) | Register rules (Al Noor GCC non-compete, Crestline MFN rate floor, Northwind PipeKit assignment, CloudSpan exclusivity, HIPAA BAA scope) plus TF-IDF retrieval of the closest clauses AtliQ has already signed. | No |
| **Clause risk scan** (F3) | Karandeep's checklist as code: LDs, liability, indemnity, payment, IP, termination, NDAs, insurance. Every finding quotes the clause. | No |
| **Entity & governing law** (F4) | AtliQ Inc for US clients, Pvt Ltd for everyone else (`atliq_entities.md`); invoicing-entity mismatch; India template sent to a US party. | No |
| **Document-set completeness** (F5) | PHI → NDA + MSA + signed BAA + subcontractor BAAs; GDPR → DPA + SCCs; annexes referenced but not attached. | No |
| **Fairness check** (F6) | When AtliQ is the buyer, the same rules are applied from the vendor's side and labelled "Fairness". | No |
| **Review brief + decision log** (F7) | Per-finding decision (Negotiate / Accept risk / Escalate) with a note; downloadable brief (.md) and log (.json). Escalation to counsel suggested per PRD rules. | No |
| **LLM-as-Judge review** | Stage 1 `llama-3.1-8b-instant` proposes clause-level findings; Stage 2 `qwen/qwen3-32b` (a reasoning model) confirms, escalates or dismisses each one with a reason. Disagreements and unverified quotes are flagged **Needs Human Review**. | Yes |
| **Single AI pass** | The original one-call review on `qwen/qwen3-32b`, kept as a mode for comparison. | Yes |
| **Ask about this contract** | Grounded Q&A over the contract, findings and register (`llama-3.3-70b-versatile`). | Yes |

Without a key the app runs in **rules + register mode**: everything above except the AI rows. The GitHub Pages site adds an **offline demo** that needs no backend at all.

### Guardrails (from the PRD)
- No finding without a clause reference and quote. AI quotes are verified against the source text.
- No green "safe to sign" state. Best status: "No blocking issues found. Karandeep's sign-off is still required".
- High findings, and every finding the two AI stages disagree on, ask for a logged human decision.
- Escalate to counsel when: value ≥ $150k with open High findings, a conflict with a signed commitment, a HIPAA/GDPR document gap, or a "non-negotiable" template with High findings.


### Severity in the UI
**Critical** is a High finding that also triggers counsel escalation (a conflict with a signed commitment, a HIPAA/GDPR gap, or a data-protection risk). Then **High** (do not sign yet), **Medium** (negotiate), **Low** (worth knowing).

## LLM-as-Judge: how it decides

| Stage 1 says | Judge rules | Shown as | Counts toward verdict? |
|---|---|---|---|
| Medium | confirm (Medium) | Medium | Yes |
| Medium | escalate (High) | High · **Needs Human Review** | Yes, as High |
| High | confirm but lowers to Medium | Medium · **Needs Human Review** | Yes, as Medium |
| Medium | dismiss | struck through · **Needs Human Review** | No |
| any | no ruling, or quote not in contract | **Needs Human Review** (unverified High drops to Medium) | Yes |

If either stage fails (rate limit, outage), the deterministic report is still returned with a note.

### Review options considered
| Option | What it is | Why / why not |
|---|---|---|
| Single AI pass (v1) | One model call adds findings | Simple, but no second opinion: when it is wrong nothing signals it. Kept as a mode for comparison. |
| **LLM-as-Judge (chosen)** | Cheap model proposes, stronger model rules on each finding | Disagreement is a visible "look here" signal; recall and precision are split between two prompts; cost stays near v1 because the judge reads short findings over a cached playbook. |
| In-house review agent | A tool-using agent that queries the register, tracker and notes itself and loops until done | Most flexible, but slower, costlier and harder to test. The deterministic layer already gives the model that context, so this is the next step only if contracts arrive from many new counterparties. |
| Self-consistency voting | Same model run 3-5 times, keep findings that appear in most runs | Reduces noise but triples cost and gives no reasoning for the human. |
| Rules only | No LLM at all | Free and predictable (and it is the offline/fallback mode), but misses context-dependent risks such as the Gulf Crown no-conflict warranty. |

## Results on the 15 drafts (rules + register mode)

Gulf Crown MSA and Harrington MSA sit in `data/demo_uploads/` rather than `data/incoming/`, so they are not pre-loaded; the draft list, queue and offline demo show the other 13. See "Live demo with uploads" below.

| Draft | What it catches |
|---|---|
| Gulf Crown MSA ($140k, due 10 Oct) | **Al Noor GCC non-compete conflict** (runs to 14 Sep 2029, binds affiliates), LD on total contract value with no client-delay carve-out, Saudi law, 60-day payment |
| BlueOrchid pilot | Al Noor conflict: Annexure B lists Dubai and Muscat properties ("just India hotels I think") |
| TravelHub | Wrong entity (AtliQ Inc for a UAE client), invoices from Pvt Ltd, and Al Noor conflict (hotel ranking for UAE/KSA = distribution services to hotels, cl. 1.11) |
| Harrington MSA + BAA ($210k) | Unsigned BAA, **no subcontractor BAA** (C-044 covers CareBridge only), PHI possibly already in Pune (huddle notes), $5M cyber vs $1M held, uncapped per-day LD, one-sided liability, indemnity for client negligence, pre-existing IP assigned |
| Daniel Ortiz contractor | Missing subcontractor BAA for Harrington EHR work |
| Marcus Reed contractor | **India template and Indian law for a US freelancer**, wrong entity, exclusivity + worldwide non-compete, INR at AtliQ's discretion |
| Kriti Data Labs | **120-day pay-when-paid**, uncapped 2%/day LD, one-sided cap, unpaid WIP on termination (all as Fairness) |
| Lakeshore | $72/hr Sr DE breaks Crestline's $85 MFN floor (retroactive credit) |
| Rheinwerk | PipeKit "sole owner" warranty vs Northwind assignment; SOW (Annex 1) and DPA (Annex 3) not attached; German-law liability carve-out correctly rated Low |
| Datavane | Breaches CloudSpan exclusivity in India + GCC; 24-month account restriction; uncapped indemnity vs $10k cap |
| FinServe "mutual" NDA | Only binds AtliQ; hidden 12-month non-compete |
| Sunrise SOW-2, LoopMart NDA, Daniel Ortiz NDA | No blocking issues (the clean controls) |

These are pinned in `tests/test_golden_cases.py` (13 tests). `tests/test_review_findings.py` adds 17 regression tests for the 6 Oct code review, and `backend/tests/` adds 57 more for the API and the judge pipeline, using a fake Groq client.

## Run it locally

Requires Python 3.10+ and Node 20+.

```bash
# 1. Backend (from the repo root)
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements.txt
export GROQ_API_KEY=gsk_...                # optional; PowerShell: $env:GROQ_API_KEY="gsk_..."
uvicorn backend.main:app --reload          # http://127.0.0.1:8000/docs

# 2. Frontend (second terminal)
cd frontend
npm install
echo VITE_API_URL=http://127.0.0.1:8000 > .env.local
npm run dev                                # http://localhost:5173
```

Leave `VITE_API_URL` empty to run the offline demo. After changing rules or the dataset, refresh the demo data with `npm run demo-data` (runs `python -m backend.export_demo`).

Tests: `pip install -r requirements.txt -r backend/requirements.txt pytest httpx && python -m pytest -q` (13 golden cases + API, judge, spend-guard, upload and prompt-injection tests, no API key needed; the AI tests use a fake client). Frontend: `cd frontend && npm test` (Vitest: brief export, severity, stale-response guard, settings).

The original Streamlit app still works: `pip install -r requirements.txt && streamlit run app.py`.

## Live demo with uploads

`data/demo_uploads/` holds two drafts that the app never loads on its own, so you can show a review happening live:

| File | What the review catches |
|---|---|
| `2026-09-18_gulf_crown_hotels_msa_draft.md` | Al Noor GCC non-compete conflict from the commitment register, LD on total contract value, Saudi law |
| `2026-09-10_harrington_health_msa_draft.md` | Healthcare deal with no signed BAA and no subcontractor BAA (HIPAA gap), uncapped per-day LD |

Open the app against the live backend, choose **Upload** in the contract picker and pick one of these files. Uploading needs the backend; the offline GitHub Pages demo cannot upload.

## Deploy

**Frontend → GitHub Pages.** `.github/workflows/deploy.yml` runs on every push to `main`:
1. **test**: golden cases, API and judge tests, and a Streamlit `AppTest` render.
2. **build**: exports the demo data from the Python pipeline, builds the React app, and runs `site/smoke_check.py` in headless Chromium (desktop and phone width) to check the default review (Kriti Data Labs, the first draft with a judge sample), the Al Noor conflict and the judge sample render with no JS errors and no sideways scroll.
3. **deploy**: publishes `frontend/dist` to `https://satishj12.github.io/<repo-name>/` (for this repo, `https://satishj12.github.io/atliq-contract-analyzer-v2/`).

One-time setup: **Settings → Pages → Source: GitHub Actions**.

**Backend → Render (free).** In Render choose **New → Blueprint**, pick this repo (it reads `render.yaml`), and set `GROQ_API_KEY` in the service's Environment tab. Render also generates `ATLIQ_ACCESS_TOKEN`: copy it from the Environment tab into the site's ⚙ settings (Access token), because the AI modes and Ask return 401 without it. Rules mode stays open. `ATLIQ_RATE_LIMIT_PER_HOUR` (default 30 AI runs per IP) and `ATLIQ_DAILY_LLM_LIMIT` (default 200, after which reviews fall back to rules) cap spend, repeat reviews of the same text are served from a cache, and `ATLIQ_CORS_ORIGINS` defaults to the GitHub Pages site. Then in GitHub add a repository variable **Settings → Secrets and variables → Actions → Variables → `ATLIQ_API_URL`** = the Render URL and re-run the workflow. If you create the service by hand instead (**New → Web Service**), deploy from the repo root: leave **Root Directory** blank, set **Build Command** to `pip install -r backend/requirements.txt` and **Start Command** to `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`, and add the same environment variables. The backend imports `analyzer.py`, `rules.py` and `data/` from the root, so a `backend/` root directory will not start. Railway works the same way.

The API key lives only on the backend, never in the static site. The site can also be pointed at a backend from the ⚙ button in its header. Render's free tier sleeps when idle, so the first request can take up to a minute; the site shows the offline demo if the backend does not answer.

## Project layout

```
├── frontend/                 React + Vite + TypeScript + Tailwind (shadcn/ui-style components)
│   ├── src/App.tsx           Tabs, mode picker, backend connection
│   ├── src/components/       ReportView, JudgeCard, FindingCard, ContractPicker, Register/Queue/About
│   ├── src/lib/              API client (live + offline demo), severity, brief export
│   └── public/demo/          Offline demo data (generated)
├── backend/
│   ├── main.py               FastAPI endpoints
│   ├── judge.py              Two-stage LLM-as-Judge pipeline
│   ├── core.py               Wraps the existing modules and serialises reports
│   ├── export_demo.py        Writes frontend/public/demo/
│   ├── demo_judge_samples.json  Illustrative judge outputs for the offline demo (Gulf Crown, Kriti)
│   └── tests/                API + judge tests
├── analyzer.py               Pipeline, quote verification, verdict, brief export (unchanged)
├── rules.py                  Document profiling + playbook rules (unchanged)
├── commitments.py            Register conflicts + TF-IDF retrieval (unchanged)
├── completeness.py           Document-set rules (unchanged)
├── data_loader.py            Dataset loading, clause splitting, PDF/DOCX extraction
├── commitment_register.json  Human-verified register of obligations from signed contracts
├── build_register.py         Re-extracts the register with the extractor model on Groq
├── app.py                    v1 Streamlit UI (still runs)
├── tests/test_golden_cases.py
├── data/                     The synthetic AtliQ dataset
├── render.yaml               Render blueprint for the backend
└── site/smoke_check.py       Browser smoke test used in CI
```

## API key and models (Groq)

The AI layer runs on [Groq](https://console.groq.com) through its OpenAI-compatible chat API (`pip install groq`). Create a key under **API Keys** in the Groq console (an existing key from another project can be reused; the AI modes need the Developer tier, see the limits below) and set it as `GROQ_API_KEY`: in your shell for local runs, in Render's Environment tab for the deployed backend (the v1 Streamlit app reads the same variable). The key only ever lives on the server; the frontend never sees it. Without a key everything runs in rules + register mode.

| Role | Default model | Override |
|---|---|---|
| Stage 1 extractor, register extraction | `llama-3.1-8b-instant` | `ATLIQ_EXTRACT_MODEL` |
| Stage 2 judge, single-pass review | `qwen/qwen3-32b` (reasoning; its `<think>` output is hidden) | `ATLIQ_REVIEW_MODEL` |
| Ask about this contract | `llama-3.3-70b-versatile` | `ATLIQ_ASK_MODEL` |

Groq's JSON mode returns valid JSON but does not enforce a schema, so the schema is written into the prompt and every answer is checked in code (`analyzer.conform`): findings with missing fields or unknown categories are dropped, and the quote check and judge logic are unchanged.

**Free-tier limits.** Groq's free tier allows about 30 requests/minute, 1,000 requests/day and 6,000 tokens/minute for most models. To stay closer to that, the contract text sent to the AI is capped at 16,000 characters (about 4,000 tokens; change it with `ATLIQ_LLM_CONTRACT_CHARS`). A longer contract is cut there and ends with "[... contract truncated for AI analysis — full text used for rules checks]". The rules, register, completeness and quote checks always read the full text, so a truncated contract still gets every deterministic finding. The playbook and register add ~6k tokens per call (NDAs, BAAs and contractor agreements send only the relevant register entries, about 1k-2k tokens less), so a judged review of a long MSA can still go over the per-minute limit; the app then shows the rules report with a plain "too long for the current Groq plan" message. For dependable live AI reviews use Groq's pay-as-you-go Developer tier, or set `ATLIQ_REVIEW_MODEL` / `ATLIQ_EXTRACT_MODEL` to models with higher limits.

## Data notes and limitations

- The dataset is unchanged. The register was compiled by reading every signed contract and is verified clause by clause against the source files; `build_register.py` is the repeatable path for new contracts.
- AtliQ's insurance limits ($1M cyber) come from the 27 Sep Harrington huddle notes; other policy limits are unknown, so higher requirements are flagged as "verify".
- Rules are tuned to this dataset's drafting. Uploaded third-party contracts will rely more on the AI layer; scanned PDFs need OCR first (pdfplumber reads text-layer PDFs only).
- Tracker matching uses the counterparty name; uploads for unknown counterparties get no tracker context.
