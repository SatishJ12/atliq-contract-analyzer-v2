import { describe, expect, it } from "vitest";
import { displaySeverity } from "./severity";
import type { Finding } from "./types";

const base: Finding = {
  id: "x", category: "Liability", severity: "High", title: "t", explanation: "", suggestion: "", clause_ref: "",
  quote: "", precedent: "", source: "rules", verified: true, section: "rules",
};

describe("displaySeverity", () => {
  it("follows the backend's critical flag when present", () => {
    expect(displaySeverity({ ...base, category: "Data protection", critical: false })).toBe("High");
    expect(displaySeverity({ ...base, critical: true })).toBe("Critical");
  });

  it("falls back to the escalation rules for older report JSON", () => {
    expect(displaySeverity({ ...base, category: "Prior commitment" })).toBe("Critical");
    expect(displaySeverity({ ...base, category: "Completeness", title: "Missing BAA" })).toBe("Critical");
    expect(displaySeverity(base)).toBe("High");
  });

  it("never upgrades a non-High finding", () => {
    expect(displaySeverity({ ...base, severity: "Medium", critical: true })).toBe("Medium");
  });
});
