import { displaySeverity } from "./severity";
import type { Report } from "./types";

export type Decision = { decision: string; note: string };

const blockquote = (text: string) => `> ${text.replace(/\r?\n/g, "\n> ")}`;
export const DECISIONS = ["Not reviewed", "Negotiate", "Accept risk (documented exception)", "Escalate to counsel", "Not applicable"];

/** Review Brief + decision log as Markdown (PRD feature F7), built in the browser so it works in demo mode too. */
export function briefMarkdown(r: Report, decisions: Record<string, Decision>): string {
  const p = r.profile;
  const out = [
    `# Review Brief — ${r.counterparty || r.filename}`,
    "",
    `*AtliQ Contract Risk Analyzer · ${r.filename} · not legal advice.*`,
    "",
    `**Status:** ${r.verdict}`,
    "",
    `- Document: ${p.doc_type} · AtliQ entity: ${p.atliq_entity} · AtliQ role: ${p.atliq_role} · Counterparty country: ${p.counterparty_country} · Governing law: ${p.governing_law || "n/a"}`,
  ];
  if (r.escalate.length) out.push("", `**Escalate to counsel:** ${r.escalate.join("; ")}`);
  if (r.llm_summary) out.push("", "## Summary", r.llm_summary);
  const section = (title: string, items: typeof r.findings) => {
    if (!items.length) return;
    out.push("", `## ${title}`);
    for (const f of items) {
      if (f.severity === "Info") continue;
      out.push("", `### [${displaySeverity(f)}] ${f.title}`, `*${f.category} · ${f.clause_ref || "—"} · source: ${f.source}*`);
      if (f.quote) out.push("", blockquote(f.quote));
      out.push("", f.explanation);
      if (f.suggestion) out.push("", `**Suggested position:** ${f.suggestion}`);
      const d = decisions[f.id];
      if (d && d.decision !== "Not reviewed") out.push("", `**Decision:** ${d.decision}${d.note ? ` — ${d.note}` : ""}`);
    }
  };
  section("Prior commitments", r.findings.filter((f) => f.section === "commitments"));
  section("Clause risks (playbook rules)", r.findings.filter((f) => f.section === "rules"));
  section("Document set", r.findings.filter((f) => f.section === "completeness"));
  section("AI review", r.findings.filter((f) => f.section === "ai"));
  if (r.judge?.findings.length) {
    out.push("", "## LLM-as-Judge review", `Stage 1: ${r.judge.extractor_model} · Stage 2 (judge): ${r.judge.judge_model}`);
    for (const f of r.judge.findings) {
      out.push(
        "",
        `### [${f.final_severity}] ${f.title}${f.needs_human_review ? " — NEEDS HUMAN REVIEW" : ""}`,
        `*${f.category} · cl. ${f.clause_ref} · Stage 1: ${f.stage1_severity} · Judge: ${f.judge_verdict} → ${f.final_severity}*`,
        "",
        blockquote(f.quote),
        "",
        `**Judge:** ${f.judge_reasoning}`,
      );
      const d = decisions[f.id];
      if (d && d.decision !== "Not reviewed") out.push("", `**Decision:** ${d.decision}${d.note ? ` — ${d.note}` : ""}`);
    }
  }
  if (r.required_docs.length) {
    out.push("", "## Documents this deal needs", "| Document | Status | Detail |", "|---|---|---|");
    for (const d of r.required_docs) out.push(`| ${d.document} | ${d.status} | ${d.detail} |`);
  }
  const qs = r.judge?.questions.length ? r.judge.questions : r.llm_questions;
  if (qs.length) out.push("", "## Questions only AtliQ can answer", ...qs.map((q) => `- ${q}`));
  return out.join("\n");
}

export type DecisionLogEntry = {
  finding_id: string;
  title: string;
  clause_ref: string;
  category: string;
  severity: string;
  source: string;
  decision: string;
  note: string;
};

/** Decision log for export: each logged decision with the finding it was made on, so the file reads on its own. */
export function decisionLog(r: Report, decisions: Record<string, Decision>): { filename: string; mode: string; decisions: DecisionLogEntry[] } {
  const entries: DecisionLogEntry[] = [];
  for (const f of r.findings) {
    const d = decisions[f.id];
    if (d && d.decision !== "Not reviewed")
      entries.push({ finding_id: f.id, title: f.title, clause_ref: f.clause_ref, category: f.category, severity: displaySeverity(f), source: f.source, ...d });
  }
  for (const f of r.judge?.findings ?? []) {
    const d = decisions[f.id];
    if (d && d.decision !== "Not reviewed")
      entries.push({ finding_id: f.id, title: f.title, clause_ref: f.clause_ref, category: f.category, severity: displaySeverity(f), source: `judge (${f.judge_verdict})`, ...d });
  }
  return { filename: r.filename, mode: r.mode, decisions: entries };
}

export function download(name: string, body: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari and Firefox start the download asynchronously; revoking at once can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
