export interface ScheduleSaveArgs {
  itemId: string;
  edit: string;
  doSave: (edit: string, signal: AbortSignal) => Promise<void>;
}

export const createSaveOrchestrator = (delayMs = 600) => {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const aborts = new Map<string, AbortController>();

  const flushOne = (itemId: string, edit: string, doSave: ScheduleSaveArgs["doSave"]) => {
    const existing = aborts.get(itemId);
    if (existing) existing.abort();
    const controller = new AbortController();
    aborts.set(itemId, controller);
    void (async () => {
      try {
        await doSave(edit, controller.signal);
      } catch {
        // Aborted by a newer schedule/cancel — caller owns the next state.
      } finally {
        if (aborts.get(itemId) === controller) aborts.delete(itemId);
      }
    })();
  };

  return {
    /** Debounced — repeated calls for the same id within the window collapse. */
    schedule({ itemId, edit, doSave }: ScheduleSaveArgs) {
      const existingTimer = timers.get(itemId);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        timers.delete(itemId);
        flushOne(itemId, edit, doSave);
      }, delayMs);
      timers.set(itemId, timer);
    },

    /** Cancel timer + abort in-flight for one id. Caller is committing a write. */
    cancel(itemId: string) {
      const timer = timers.get(itemId);
      if (timer) {
        clearTimeout(timer);
        timers.delete(itemId);
      }
      const controller = aborts.get(itemId);
      if (controller) {
        controller.abort();
        aborts.delete(itemId);
      }
    },

    /**
     * Synchronously fire still-pending timers (one PATCH each). Called from
     * the provider's unmount cleanup so the trailing 600 ms isn't dropped.
     */
    flushAllPending(getArgs: (itemId: string) => Omit<ScheduleSaveArgs, "itemId"> | undefined) {
      for (const [itemId, timer] of timers) {
        clearTimeout(timer);
        const args = getArgs(itemId);
        if (!args) continue;
        flushOne(itemId, args.edit, args.doSave);
      }
      timers.clear();
    },

    /**
     * Cancel every pending timer + abort every in-flight save. Used by the
     * push-to-dataset path which deletes rows server-side: any post-flush
     * PATCH would re-create a ghost row (FINAL-SELECT misses, falls through
     * to defaults), undoing the delete tombstone with a fresh `updated_at`.
     */
    cancelAll() {
      for (const [, timer] of timers) clearTimeout(timer);
      timers.clear();
      for (const [, controller] of aborts) controller.abort();
      aborts.clear();
    },

    /** Cheap probe used by the windowed-eviction logic in the queue store. */
    hasPending(itemId: string): boolean {
      return timers.has(itemId) || aborts.has(itemId);
    },
  };
};
