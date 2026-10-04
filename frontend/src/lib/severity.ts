import type { BadgeProps } from "@/components/ui/badge";
import type { DisplaySeverity, Finding, JudgedFinding, Severity } from "./types";

/**
 * "Critical" is a display tier: a High finding that also triggers counsel escalation in the
 * backend (a conflict with a signed commitment, a HIPAA/GDPR document gap, or a data-protection breach risk).
 * The backend sends `critical` per finding (analyzer.is_critical); the rule below is only a fallback for older report JSON.
 */
export function displaySeverity(f: Finding | JudgedFinding): DisplaySeverity {
  const sev: Severity = "final_severity" in f ? f.final_severity : f.severity;
  if (sev !== "High") return sev;
  if (typeof f.critical === "boolean") return f.critical ? "Critical" : "High";
  if (f.category === "Prior commitment" || f.category === "Data protection") return "Critical";
  if (f.category === "Completeness" && /BAA|DPA|Annex|PHI/.test(f.title)) return "Critical";
  return "High";
}

export const SEV_VARIANT: Record<DisplaySeverity, NonNullable<BadgeProps["variant"]>> = {
  Critical: "critical",
  High: "high",
  Medium: "medium",
  Low: "low",
  Info: "info",
};

export const SEV_RANK: Record<DisplaySeverity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };

export function sortBySeverity<T extends Finding | JudgedFinding>(xs: T[]): T[] {
  return [...xs].sort((a, b) => SEV_RANK[displaySeverity(a)] - SEV_RANK[displaySeverity(b)]);
}
