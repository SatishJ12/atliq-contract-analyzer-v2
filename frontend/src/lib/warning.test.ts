import { describe, expect, it } from "vitest";
import { mergeWarnings } from "./warning";

describe("mergeWarnings", () => {
  it("keeps the upload's page note when the AI report has its own warning", () => {
    expect(mergeWarnings("Today's AI review budget is used up, so this ran in rules mode.", "Only the first 150 of 210 pages were read.")).toBe(
      "Today's AI review budget is used up, so this ran in rules mode. Only the first 150 of 210 pages were read.",
    );
  });

  it("does not repeat a sentence both runs reported", () => {
    const ocr = "Very little text was found. If this is a scanned PDF it needs OCR first.";
    expect(mergeWarnings(ocr, `${ocr} Only the first 150 of 210 pages were read.`)).toBe(
      `${ocr} Only the first 150 of 210 pages were read.`,
    );
  });

  it("is undefined when neither run warned", () => {
    expect(mergeWarnings(undefined, "")).toBeUndefined();
  });
});
