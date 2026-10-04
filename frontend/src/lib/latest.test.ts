import { describe, expect, it } from "vitest";
import { createLatestGuard } from "./latest";

const later = <T,>(value: T, ms: number) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("createLatestGuard", () => {
  it("drops a slow response that lands after a newer request (H4)", async () => {
    const guard = createLatestGuard();
    const shown: string[] = [];
    const run = async (name: string, ms: number) => {
      const t = guard.start();
      const r = await later(name, ms);
      if (t.isCurrent()) shown.push(r);
    };
    await Promise.all([run("Gulf Crown (slow judge run)", 30), run("LoopMart", 5)]);
    expect(shown).toEqual(["LoopMart"]);
  });

  it("aborts the previous request's signal", () => {
    const guard = createLatestGuard();
    const first = guard.start();
    const second = guard.start();
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it("cancel() makes the running request stale", () => {
    const guard = createLatestGuard();
    const t = guard.start();
    guard.cancel();
    expect(t.isCurrent()).toBe(false);
    expect(t.signal.aborted).toBe(true);
  });
});
