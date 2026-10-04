export type Severity = "High" | "Medium" | "Low" | "Info";
export type DisplaySeverity = "Critical" | Severity;
export type Section = "rules" | "commitments" | "completeness" | "ai";
export type Mode = "rules" | "single" | "judge" | "demo";

export interface Finding {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  explanation: string;
  suggestion: string;
  clause_ref: string;
  quote: string;
  precedent: string;
  source: string;
  verified: boolean;
  section: Section;
  /** High finding that triggers counsel escalation (set by the backend; one source of truth with the verdict). */
  critical?: boolean;
}

export interface JudgedFinding {
  id: string;
  category: string;
  title: string;
  clause_ref: string;
  quote: string;
  explanation: string;
  suggestion: string;
  stage1_severity: Severity;
  judge_verdict: "confirm" | "escalate" | "dismiss" | "not_reviewed";
  final_severity: Severity;
  judge_reasoning: string;
  precedent: string;
  verified: boolean;
  needs_human_review: boolean;
  review_reasons: string[];
  counts_toward_verdict: boolean;
  stage1_id?: string;
  critical?: boolean;
}

export interface JudgeResult {
  extractor_model: string;
  judge_model: string;
  summary: string;
  questions: string[];
  error: string;
  sample?: boolean;
  stats: Record<"confirm" | "escalate" | "dismiss" | "not_reviewed" | "needs_human_review" | "total", number>;
  findings: JudgedFinding[];
}

export interface RequiredDoc {
  document: string;
  status: string;
  detail: string;
}

export interface Report {
  filename: string;
  counterparty: string;
  title: string;
  profile: {
    doc_type: string;
    is_nda: boolean;
    atliq_entity: string;
    atliq_role: string;
    counterparty_country: string;
    governing_law: string;
  };
  tracker: Record<string, string | number | null>[];
  verdict: string;
  verdict_level: "blockers" | "negotiate" | "clear";
  escalate: string[];
  counts: Record<Severity, number>;
  value_usd: number;
  deadline: string | null;
  days_left: number | null;
  findings: Finding[];
  required_docs: RequiredDoc[];
  bundle: Record<string, string | number | null>[];
  precedents: { draft_ref: string; signed_source: string; signed_ref: string; score: number; draft_text: string; signed_text: string }[];
  context_notes: { name: string; body: string }[];
  llm_summary: string;
  llm_questions: string[];
  llm_used: boolean;
  llm_error: string;
  judge: JudgeResult | null;
  mode: Mode;
  warning?: string;
  /** True when the backend served this from its result cache (no new AI spend). */
  cached?: boolean;
  /** Extracted text, returned for uploads so Ask and re-runs work without re-uploading. */
  text?: string;
}

export interface Draft {
  filename: string;
  label: string;
  deadline: string | null;
  high: number;
  verdict_level: Report["verdict_level"];
  has_judge_sample?: boolean;
}

export interface Health {
  ok: boolean;
  llm_available: boolean;
  modes: Mode[];
  token_required?: boolean;
  extractor_model: string;
  judge_model: string;
  dataset_today: string;
}

export interface RegisterEntry {
  id: string;
  counterparty: string;
  tracker_id: string;
  type: string;
  binds: string;
  source_file: string;
  clause: string;
  quote: string;
  plain_english: string;
  start: string;
  ends: string | null;
  ends_note: string;
  severity: Severity;
  exceptions?: string;
  active: boolean;
}

export interface QueueRow {
  contract_id: string;
  counterparty: string;
  doc_type: string;
  atliq_entity: string;
  client_country: string;
  value_usd: number | null;
  status: string;
  notes: string;
  deadline: string | null;
  high: number | null;
  scan_verdict: string;
  scan_level: Report["verdict_level"] | null;
  draft: string | null;
}
