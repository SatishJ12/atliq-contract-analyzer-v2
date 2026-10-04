import { AlertTriangle, ChevronDown, Quote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/textarea";
import { DECISIONS, type Decision } from "@/lib/brief";
import { SEV_VARIANT, displaySeverity } from "@/lib/severity";
import type { Finding } from "@/lib/types";

const SOURCE_LABEL: Record<string, string> = {
  rules: "Playbook rule",
  register: "Commitment register",
  llm: "AI",
  claude: "Claude",
  notes: "Team notes",
};

/** Contract text is Markdown; strip emphasis markers for display. */
export const plain = (s: string) => s.replace(/\*\*|__/g, "");

export function QuoteBlock({ text }: { text: string }) {
  return (
    <blockquote className="flex gap-2 rounded-md border-l-4 border-primary/40 bg-muted px-3 py-2 text-sm leading-relaxed">
      <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="italic">{plain(text)}</span>
    </blockquote>
  );
}

export function DecisionPicker({ value, onChange }: { value?: Decision; onChange: (d: Decision) => void }) {
  const cur = value ?? { decision: "Not reviewed", note: "" };
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3 sm:flex-row sm:items-center">
      <label className="text-xs font-medium text-muted-foreground sm:w-20">Decision</label>
      <select
        className="h-9 rounded-md border border-border bg-card px-2 text-sm"
        value={cur.decision}
        onChange={(e) => onChange({ ...cur, decision: e.target.value })}
      >
        {DECISIONS.map((d) => (
          <option key={d}>{d}</option>
        ))}
      </select>
      <Input placeholder="Note / reason" value={cur.note} onChange={(e) => onChange({ ...cur, note: e.target.value })} />
    </div>
  );
}

export function FindingCard({ f, decision, onDecision }: { f: Finding; decision?: Decision; onDecision: (d: Decision) => void }) {
  const sev = displaySeverity(f);
  return (
    <Collapsible defaultOpen={sev === "Critical" || sev === "High"} className="rounded-md border border-border">
      <CollapsibleTrigger className="group flex w-full items-start gap-3 p-3 text-left hover:bg-muted/50">
        <Badge variant={SEV_VARIANT[sev]} className="mt-0.5">{sev}</Badge>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium leading-snug">{f.title}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {f.category} · {f.clause_ref ? `cl. ${f.clause_ref.replace(/^cl\.\s*/, "")}` : "—"} · {SOURCE_LABEL[f.source] ?? f.source}
          </span>
        </span>
        <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-3 pb-3">
        {!f.verified && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-3.5" /> Quote not found in the contract
          </p>
        )}
        {f.quote && <QuoteBlock text={f.quote} />}
        <p className="text-sm leading-relaxed">{plain(f.explanation)}</p>
        {f.suggestion && (
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">Suggested position: </span>
            {plain(f.suggestion)}
          </p>
        )}
        {f.precedent && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Precedent: </span>
            {plain(f.precedent)}
          </p>
        )}
        {(f.severity === "High" || f.severity === "Medium") && <DecisionPicker value={decision} onChange={onDecision} />}
      </CollapsibleContent>
    </Collapsible>
  );
}
