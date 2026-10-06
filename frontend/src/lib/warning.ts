/**
 * Warnings from two runs of the same review, without repeats. In the AI modes an upload is read once (rules run),
 * then its text is re-sent for the AI run, so a note only the upload can know ("only the first 150 pages were
 * read") would be lost when the AI report replaces the first one.
 */
export function mergeWarnings(...warnings: (string | undefined)[]): string | undefined {
  const seen: string[] = [];
  for (const w of warnings) {
    for (const s of (w ?? "").split(/(?<=\.)\s+/)) {
      const t = s.trim();
      if (t && !seen.includes(t)) seen.push(t);
    }
  }
  return seen.length ? seen.join(" ") : undefined;
}
