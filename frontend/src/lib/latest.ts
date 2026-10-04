/**
 * Guards against stale responses: only the most recently started request may update the screen.
 * Starting a new request aborts the previous one.
 */
export function createLatestGuard() {
  let current = 0;
  let controller: AbortController | undefined;
  return {
    start() {
      controller?.abort();
      controller = new AbortController();
      const id = ++current;
      const signal = controller.signal;
      return { signal, isCurrent: () => id === current && !signal.aborted };
    },
    /** Abort whatever is running without starting anything new. */
    cancel() {
      controller?.abort();
      current++;
    },
  };
}

export type RequestTicket = ReturnType<ReturnType<typeof createLatestGuard>["start"]>;
