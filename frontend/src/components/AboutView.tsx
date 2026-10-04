import { ArrowDown, Bot, FileSearch, Gavel, ShieldCheck, UserCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Health } from "@/lib/types";

const STEPS = [
  { icon: FileSearch, title: "Deterministic checks", body: "Karandeep's checklist as code, AtliQ's entity rules, the commitment register from 17 signed contracts, and HIPAA / GDPR document-set rules. Runs with no API key and quotes every clause.", tag: "always on" },
  { icon: Bot, title: "Stage 1 · Extractor", body: "A fast model reads the whole contract and proposes every clause that could hurt AtliQ, with an initial severity and a verbatim quote. It is told to over-report: a judge checks every call.", tag: "extractor" },
  { icon: Gavel, title: "Stage 2 · Judge", body: "A stronger model sees the contract, the playbook, past negotiation positions and the register, and rules on each Stage 1 finding: confirm, escalate or dismiss, with a one-line reason.", tag: "judge" },
  { icon: ShieldCheck, title: "Grounding & disagreement check", body: "Every quote is string-matched against the contract. Any finding the two stages disagree on, or whose quote is not found, is flagged Needs Human Review. Dismissed findings stay visible but stop counting.", tag: "code" },
  { icon: UserCheck, title: "Karandeep decides", body: "High findings ask for a logged decision. Counsel escalation is suggested for deals ≥ $150k with open Highs, signed-commitment conflicts, HIPAA / GDPR gaps and non-negotiable templates. There is no green 'safe' state.", tag: "human" },
];

const SEVERITY = [
  ["Critical", "critical", "A High finding that also triggers counsel escalation: a conflict with a signed commitment, a HIPAA / GDPR gap, or a data-protection breach risk."],
  ["High", "high", "Do not sign until resolved."],
  ["Medium", "medium", "Negotiate before signing."],
  ["Low", "low", "Worth knowing; usually acceptable."],
] as const;

export function AboutView({ health }: { health?: Health }) {
  const tags: Record<string, string> = { extractor: health?.extractor_model ?? "llama-3.1-8b-instant", judge: health?.judge_model ?? "qwen/qwen3-32b" };
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">How a review works</h2>
        <p className="mt-1 text-sm text-muted-foreground">Synthetic AtliQ dataset (today = 28 Sep 2026). This tool informs a decision; it is not legal advice.</p>
      </div>
      <div className="space-y-2">
        {STEPS.map((s, i) => (
          <div key={s.title}>
            <Card className="flex gap-4 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                <s.icon className="size-5" />
              </span>
              <div>
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {s.title} <Badge variant="primary">{tags[s.tag] ?? s.tag}</Badge>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </Card>
            {i < STEPS.length - 1 && <ArrowDown className="mx-auto my-1 size-4 text-muted-foreground" />}
          </div>
        ))}
      </div>
      <Card className="p-4">
        <p className="mb-3 font-semibold">Severity</p>
        <div className="space-y-2">
          {SEVERITY.map(([label, v, body]) => (
            <div key={label} className="flex items-start gap-3 text-sm">
              <Badge variant={v} className="w-16 justify-center">{label}</Badge>
              <span className="text-muted-foreground">{body}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <p className="mb-2 font-semibold">Why LLM-as-Judge</p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>A single model call has no second opinion: when it is wrong, nothing tells Karandeep. Two models that disagree is a cheap, visible signal that a person should look.</li>
          <li>The extractor is tuned for recall (miss nothing); the judge for precision (dismiss noise). That split beats asking one model to do both.</li>
          <li>Cost stays low: the cheap model reads first, and the judge only rules on short findings plus the contract it already has cached.</li>
        </ul>
      </Card>
    </div>
  );
}
