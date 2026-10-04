import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Gavel, Scale, TrendingUp, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Decision } from "@/lib/brief";
import { SEV_VARIANT, displaySeverity } from "@/lib/severity";
import type { JudgedFinding } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DecisionPicker, QuoteBlock } from "./FindingCard";

const VERDICT = {
  confirm: { label: "Confirmed", icon: CheckCircle2, cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/50 dark:border-emerald-900" },
  escalate: { label: "Escalated", icon: TrendingUp, cls: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/50 dark:border-red-900" },
  dismiss: { label: "Dismissed", icon: XCircle, cls: "text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700" },
  not_reviewed: { label: "Not ruled on", icon: AlertTriangle, cls: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/50 dark:border-amber-900" },
} as const;

export function JudgeCard({ f, decision, onDecision }: { f: JudgedFinding; decision?: Decision; onDecision: (d: Decision) => void }) {
  const v = VERDICT[f.judge_verdict];
  const finalSev = displaySeverity(f);
  const dismissed = f.judge_verdict === "dismiss";
  return (
    <Collapsible
      defaultOpen={f.needs_human_review && !dismissed}
      className={cn(
        "rounded-md border",
        f.needs_human_review ? "border-fuchsia-300 ring-1 ring-fuchsia-200 dark:border-fuchsia-800 dark:ring-fuchsia-900" : "border-border",
        dismissed && "opacity-80",
      )}
    >
      <CollapsibleTrigger className="group flex w-full items-start gap-3 p-3 text-left hover:bg-muted/50">
        <Badge variant={SEV_VARIANT[finalSev]} className={cn("mt-0.5", dismissed && "line-through")}>{finalSev}</Badge>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium leading-snug">
            {f.title}
            {f.needs_human_review && (
              <Badge variant="review">
                <AlertTriangle /> Needs Human Review
              </Badge>
            )}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {f.category} · cl. {f.clause_ref}
          </span>
        </span>
        <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-3 pb-3">
        <QuoteBlock text={f.quote} />
        {/* Stage 1 → Stage 2 */}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
          <div className="rounded-md border border-border bg-muted/50 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Scale className="size-3.5" /> Stage 1 · Extractor
            </p>
            <Badge variant={SEV_VARIANT[f.stage1_severity]}>{f.stage1_severity}</Badge>
            <p className="mt-2 text-sm leading-relaxed">{f.explanation}</p>
          </div>
          <div className="hidden items-center sm:flex">
            <ArrowRight className="size-4 text-muted-foreground" />
          </div>
          <div className="rounded-md border border-border bg-muted/50 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Gavel className="size-3.5" /> Stage 2 · Judge
            </p>
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", v.cls)}>
                <v.icon className="size-3" /> {v.label}
              </span>
              <Badge variant={SEV_VARIANT[f.final_severity]}>{f.final_severity}</Badge>
            </span>
            <p className="mt-2 text-sm leading-relaxed">{f.judge_reasoning}</p>
          </div>
        </div>
        {f.needs_human_review && (
          <p className="rounded-md bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-800 dark:bg-fuchsia-950/50 dark:text-fuchsia-200">
            <span className="font-semibold">Why a person should look: </span>
            {f.review_reasons.join(" · ")}
            {dismissed && ". Dismissed findings do not count toward the verdict."}
          </p>
        )}
        {f.suggestion && (
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">Suggested position: </span>
            {f.suggestion}
          </p>
        )}
        {f.precedent && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Precedent: </span>
            {f.precedent}
          </p>
        )}
        {(f.needs_human_review || f.final_severity === "High") && <DecisionPicker value={decision} onChange={onDecision} />}
      </CollapsibleContent>
    </Collapsible>
  );
}
