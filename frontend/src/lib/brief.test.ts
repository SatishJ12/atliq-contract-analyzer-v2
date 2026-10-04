import { describe, expect, it } from "vitest";
import gulf from "../../public/demo/reports/2026-09-18_gulf_crown_hotels_msa_draft.json";
import { briefMarkdown, decisionLog } from "./brief";
import type { Report } from "./types";

const report = gulf as unknown as Report;

describe("briefMarkdown", () => {
  it("quotes every line of a multi-line clause", () => {
    const r: Report = { ...report, findings: [{ ...report.findings[0], quote: "line one\nline two\r\nline three" }] };
    const md = briefMarkdown(r, {});
    expect(md).toContain("> line one\n> line two\n> line three");
  });

  it("includes logged decisions and the judge section", () => {
    const f = report.findings[0];
    const md = briefMarkdown(report, { [f.id]: { decision: "Negotiate", note: "push back" } });
    expect(md).toContain("**Decision:** Negotiate — push back");
    expect(md).toContain("## LLM-as-Judge review");
  });
});

describe("decisionLog", () => {
  it("exports each decision with the finding it was made on", () => {
    const f = report.findings[0];
    const j = report.judge!.findings[0];
    const log = decisionLog(report, {
      [f.id]: { decision: "Accept risk (documented exception)", note: "CEO ok" },
      [j.id]: { decision: "Escalate to counsel", note: "" },
      unknown: { decision: "Negotiate", note: "" },
    });
    expect(log.filename).toBe(report.filename);
    expect(log.decisions).toHaveLength(2);
    expect(log.decisions[0]).toMatchObject({ finding_id: f.id, title: f.title, clause_ref: f.clause_ref, decision: "Accept risk (documented exception)" });
    expect(log.decisions[1]).toMatchObject({ finding_id: j.id, title: j.title });
  });
});
