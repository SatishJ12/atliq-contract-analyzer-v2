import {
  AlertOctagon, BookOpen, Bot, CalendarClock, CircleDollarSign, Download, FileStack, Gavel, Handshake, HelpCircle,
  Info, Loader2, MessageSquare, RotateCw, ScrollText, Send, ShieldAlert, Sparkles, TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/textarea";
import type { Client } from "@/lib/api";
import { briefMarkdown, decisionLog, download, type Decision } from "@/lib/brief";
import { MODE_LABEL } from "@/lib/modes";
import { SEV_VARIANT, displaySeverity, sortBySeverity } from "@/lib/severity";
import type { DisplaySeverity, Finding, Mode, Report } from "@/lib/types";
import { cn, fmtDate, fmtUsd } from "@/lib/utils";
import { FindingCard } from "./FindingCard";
import { JudgeCard } from "./JudgeCard";
import { Empty, Section } from "./Section";

const VERDICT_STYLE = {
  blockers: { cls: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100", icon: AlertOctagon },
  negotiate: { cls: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100", icon: TriangleAlert },
  clear: { cls: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100", icon: Info },
};

function countBy(fs: { sev: DisplaySeverity }[]) {
  const c: Record<DisplaySeverity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 };
  fs.forEach((f) => c[f.sev]++);
  return c;
}

function SevCounts({ items }: { items: Finding[] }) {
  const c = countBy(items.map((f) => ({ sev: displaySeverity(f) })));
  return (
    <>
      {(["Critical", "High", "Medium", "Low"] as const).map((s) =>
        c[s] ? (
          <Badge key={s} variant={SEV_VARIANT[s]}>
            {c[s]} {s}
          </Badge>
        ) : null,
      )}
    </>
  );
}

function Stat({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: string; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3 sm:p-4", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function ReportView({
  report: r, client, source, selectedMode, canRerun, onRerun,
}: {
  report: Report;
  client: Client;
  source: { draft?: string; text?: string; filename?: string };
  selectedMode: Mode;
  canRerun: boolean;
  onRerun: () => void;
}) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ loading: boolean; text?: string; error?: string }>({ loading: false });
  const setDecision = (id: string) => (d: Decision) => setDecisions((cur) => ({ ...cur, [id]: d }));

  const by = (s: Finding["section"]) => sortBySeverity(r.findings.filter((f) => f.section === s));
  const rules = by("rules");
  const commitments = by("commitments");
  const completeness = by("completeness");
  const aiSingle = by("ai");
  const judge = r.judge;
  const judged = judge?.findings.filter((f) => f.counts_toward_verdict) ?? [];
  const all = [...r.findings, ...judged].map((f) => ({ sev: displaySeverity(f) }));
  const c = countBy(all);
  const V = VERDICT_STYLE[r.verdict_level];
  const undecided = (id: string) => (decisions[id]?.decision ?? "Not reviewed") === "Not reviewed";
  const openHigh =
    r.findings.filter((f) => f.severity === "High" && undecided(f.id)).length +
    judged.filter((f) => f.final_severity === "High" && undecided(f.id)).length;
  const stem = r.filename.replace(/\.[^.]+$/, "");

  async function ask() {
    if (!question.trim()) return;
    setAnswer({ loading: true });
    try {
      setAnswer({ loading: false, text: await client.ask(question, source) });
    } catch (e) {
      setAnswer({ loading: false, error: (e as Error).message });
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{r.profile.doc_type}</p>
            <h2 className="mt-0.5 text-xl font-semibold leading-tight sm:text-2xl">{r.counterparty || r.title || r.filename}</h2>
            {r.counterparty && r.title && <p className="mt-0.5 text-sm text-muted-foreground">{r.title}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              <Badge>Entity on paper: {r.profile.atliq_entity}</Badge>
              <Badge>AtliQ is the {r.profile.atliq_role}</Badge>
              <Badge>Counterparty: {r.profile.counterparty_country}</Badge>
              <Badge>Law: {r.profile.governing_law || "not stated"}</Badge>
              {r.tracker.map((t) => (
                <Badge key={String(t.contract_id)} variant="primary">
                  {String(t.contract_id)}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => download(`review_brief_${stem}.md`, briefMarkdown(r, decisions))}>
              <Download /> Brief
            </Button>
            <Button variant="outline" size="sm" onClick={() => download(`decisions_${stem}.json`, JSON.stringify(decisionLog(r, decisions), null, 2), "application/json")}>
              <ScrollText /> Decision log
            </Button>
          </div>
        </div>

        <div className={cn("mt-4 flex gap-3 rounded-lg border p-3 sm:p-4", V.cls)}>
          <V.icon className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{r.verdict}.</p>
            <p className="text-sm opacity-80">This tool flags; Karandeep decides. There is no "safe to sign" state.</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <Badge>Reviewed in: {MODE_LABEL[r.mode]}</Badge>
              {r.cached && <Badge variant="info">Cached result, no new AI cost</Badge>}
              {canRerun && selectedMode !== r.mode && (
                <Button variant="outline" size="sm" className="h-7" onClick={onRerun}>
                  <RotateCw /> Re-run in {MODE_LABEL[selectedMode]}
                </Button>
              )}
            </div>
          </div>
        </div>

        {r.escalate.length > 0 && (
          <div className="mt-3 flex gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-orange-900 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-100">
            <Gavel className="mt-0.5 size-5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">Escalate to counsel</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {r.escalate.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {judge && judge.stats.needs_human_review > 0 && (
          <a
            href="#judge"
            className="mt-3 flex items-center gap-3 rounded-lg bg-fuchsia-600 p-3 text-white shadow-sm hover:bg-fuchsia-700"
          >
            <TriangleAlert className="size-5 shrink-0" />
            <span className="text-sm">
              <span className="font-semibold">{judge.stats.needs_human_review} AI finding{judge.stats.needs_human_review > 1 ? "s" : ""} need human review</span>
              {" "}— the extractor and the judge disagree, or a quote could not be verified.
            </span>
          </a>
        )}
        {r.llm_error && <p className="mt-3 text-xs text-muted-foreground">AI review unavailable for this run ({r.llm_error}). Showing deterministic checks only.</p>}
        {r.warning && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{r.warning}</p>}
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Critical" value={c.Critical} className={c.Critical ? "border-red-300 dark:border-red-800" : ""} />
        <Stat label="High" value={c.High} />
        <Stat label="Medium" value={c.Medium} />
        <Stat label="Low" value={c.Low} />
        <Stat label="Deal value" value={<span className="flex items-center gap-1"><CircleDollarSign className="size-5 text-muted-foreground" />{fmtUsd(r.value_usd)}</span>} />
        <Stat
          label="Due"
          value={<span className="flex items-center gap-1"><CalendarClock className="size-5 text-muted-foreground" />{r.deadline ? fmtDate(r.deadline).replace(/ \d{4}$/, "") : "—"}</span>}
          sub={r.days_left != null ? `${r.days_left} days from dataset date` : undefined}
        />
      </div>

      {(judge?.summary || r.llm_summary) && (
        <Card className="flex gap-3 p-4">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-violet-500" />
          <p className="text-sm leading-relaxed">{judge?.summary || r.llm_summary}</p>
        </Card>
      )}

      {/* Sections */}
      {judge ? (
        <Section
          id="judge"
          icon={<Gavel />}
          tone="ai"
          title="LLM-as-Judge review"
          subtitle={`Stage 1 ${judge.extractor_model} proposes · Stage 2 ${judge.judge_model} confirms, escalates or dismisses`}
          count={
            <>
              {judge.sample && <Badge variant="primary">Sample output</Badge>}
              {judge.stats.needs_human_review > 0 && <Badge variant="review">{judge.stats.needs_human_review} need review</Badge>}
            </>
          }
        >
          <div className="mb-4 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
            {([
              ["Confirmed", judge.stats.confirm, "text-emerald-600"],
              ["Escalated", judge.stats.escalate, "text-red-600"],
              ["Dismissed", judge.stats.dismiss, "text-slate-500"],
              ["Need review", judge.stats.needs_human_review, "text-fuchsia-600"],
            ] as const).map(([l, n, cls]) => (
              <div key={l} className="rounded-md bg-muted p-2">
                <p className={cn("text-lg font-semibold tabular-nums", cls)}>{n}</p>
                <p className="text-muted-foreground">{l}</p>
              </div>
            ))}
          </div>
          {judge.sample && (
            <p className="mb-3 text-xs text-muted-foreground">
              Offline demo: this is an illustrative run of the two-stage pipeline, checked by the same quote verification the live service uses. Connect the backend with an API key to run it on any contract.
            </p>
          )}
          {judge.error && <Empty>The AI review failed for this run: {judge.error}</Empty>}
          <div className="space-y-2">
            {judge.findings.map((f) => (
              <JudgeCard key={f.id} f={f} decision={decisions[f.id]} onDecision={setDecision(f.id)} />
            ))}
          </div>
          {!judge.findings.length && !judge.error && <Empty>The extractor found nothing beyond the deterministic checks.</Empty>}
        </Section>
      ) : aiSingle.length ? (
        <Section icon={<Bot />} tone="ai" title="AI findings" subtitle="Single-pass AI review" count={<SevCounts items={aiSingle} />}>
          <div className="space-y-2">
            {aiSingle.map((f) => (
              <FindingCard key={f.id} f={f} decision={decisions[f.id]} onDecision={setDecision(f.id)} />
            ))}
          </div>
        </Section>
      ) : (
        <Section icon={<Bot />} tone="ai" title="AI findings" defaultOpen={false} subtitle={client.live ? "Not run: the backend has no API key, or rules-only mode was chosen" : "Pick Gulf Crown or Kriti Data Labs to see a sample LLM-as-Judge run"}>
          <Empty>
            {client.live
              ? "Set GROQ_API_KEY on the backend and choose the LLM-as-Judge mode to add the two-stage AI review."
              : "In the offline demo, the Gulf Crown MSA and Kriti Data Labs subcontract include a sample LLM-as-Judge run."}
          </Empty>
        </Section>
      )}

      <Section
        icon={<Handshake />}
        tone={commitments.some((f) => f.severity === "High") ? "danger" : "default"}
        title="Commitment conflicts"
        subtitle="Checked against the register of obligations in AtliQ's 17 signed contracts"
        count={<SevCounts items={commitments} />}
      >
        {commitments.length ? (
          <div className="space-y-2">
            {commitments.map((f) => (
              <FindingCard key={f.id} f={f} decision={decisions[f.id]} onDecision={setDecision(f.id)} />
            ))}
          </div>
        ) : (
          <Empty>No conflicts with existing commitments were found.</Empty>
        )}
      </Section>

      <Section icon={<ShieldAlert />} title="Rule-based findings" subtitle="Karandeep's checklist and AtliQ's entity rules, applied clause by clause" count={<SevCounts items={rules} />}>
        {rules.length ? (
          <div className="space-y-2">
            {rules.map((f) => (
              <FindingCard key={f.id} f={f} decision={decisions[f.id]} onDecision={setDecision(f.id)} />
            ))}
          </div>
        ) : (
          <Empty>No clause-level issues found by the playbook rules.</Empty>
        )}
      </Section>

      <Section
        icon={<FileStack />}
        title="Completeness gaps"
        subtitle="Documents this deal needs (BAA, DPA, annexes) and what the tracker holds"
        count={<SevCounts items={completeness} />}
      >
        <div className="space-y-4">
          {completeness.length > 0 && (
            <div className="space-y-2">
              {completeness.map((f) => (
                <FindingCard key={f.id} f={f} decision={decisions[f.id]} onDecision={setDecision(f.id)} />
              ))}
            </div>
          )}
          {r.required_docs.length ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Document</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {r.required_docs.map((d) => (
                    <tr key={d.document} className="border-t border-border align-top">
                      <td className="p-2 font-medium">{d.document}</td>
                      <td className="p-2">
                        <Badge variant={d.status === "Present" ? "low" : "high"}>{d.status}</Badge>
                      </td>
                      <td className="p-2 text-muted-foreground">{d.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !completeness.length && <Empty>No special document-set requirements detected (no PHI or GDPR signals).</Empty>
          )}
        </div>
      </Section>

      {(r.context_notes.length > 0 || r.precedents.length > 0) && (
        <Section icon={<BookOpen />} title="Precedents & team notes" defaultOpen={false} subtitle="What the team already knows, and the closest clauses AtliQ has signed before">
          <div className="space-y-3">
            {r.context_notes.map((n) => (
              <details key={n.name} className="rounded-md border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">{n.name}</summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">{n.body}</pre>
              </details>
            ))}
            {r.precedents.map((p, i) => (
              <details key={i} className="rounded-md border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Draft cl. {p.draft_ref} ↔ {p.signed_source} cl. {p.signed_ref}{" "}
                  <span className="text-muted-foreground">(similarity {p.score})</span>
                </summary>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                  <p className="rounded bg-muted p-2"><span className="font-semibold">This draft: </span>{p.draft_text}…</p>
                  <p className="rounded bg-muted p-2"><span className="font-semibold">Signed: </span>{p.signed_text}…</p>
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}

      {(judge?.questions.length || r.llm_questions.length) ? (
        <Section icon={<HelpCircle />} title="Questions only AtliQ can answer">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {(judge?.questions.length ? judge.questions : r.llm_questions).map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {openHigh > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {openHigh} High finding{openHigh > 1 ? "s" : ""} still {openHigh > 1 ? "have" : "has"} no logged decision.
        </p>
      )}

      <Card className="p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="size-4" /> Ask about this contract
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
        >
          <Input
            disabled={!client.live}
            placeholder={client.live ? "e.g. Does the Al Noor waiver help here?" : "Available when the live backend is connected"}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button type="submit" disabled={!client.live || answer.loading} size="icon" aria-label="Ask">
            {answer.loading ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </form>
        {answer.text && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{answer.text}</p>}
        {answer.error && <p className="mt-3 text-sm text-red-600">{answer.error}</p>}
      </Card>
    </div>
  );
}
