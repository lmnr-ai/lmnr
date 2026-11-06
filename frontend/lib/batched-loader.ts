/**
 * Collects ids requested within a debounce window and loads them in fixed-size chunks.
 * Ids already resolved, queued, or in flight are skipped. A chunk whose load fails stays
 * unresolved, so a later `request` for those ids retries.
 */
export interface BatchedLoaderOptions<V> {
  /** Loads one chunk; `undefined` marks the chunk as failed. */
  load: (ids: string[]) => Promise<Record<string, V> | undefined>;
  /** Receives each successfully loaded chunk. */
  onLoaded: (values: Record<string, V>) => void;
  isResolved: (id: string) => boolean;
  /** Defaults to 100, the cap the trace batch routes enforce. */
  batchSize?: number;
  debounceMs?: number;
}

export interface BatchedLoader {
  request: (ids: string[]) => void;
}

export function createBatchedLoader<V>({
  load,
  onLoaded,
  isResolved,
  batchSize = 100,
  debounceMs = 150,
}: BatchedLoaderOptions<V>): BatchedLoader {
  const pending = new Set<string>();
  const inFlight = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    const ids = [...pending];
    pending.clear();
    for (const id of ids) inFlight.add(id);
    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      try {
        const values = await load(chunk);
        if (values) onLoaded(values);
      } catch {
        // Treated like a failed load: the chunk stays unresolved for a later retry.
      } finally {
        for (const id of chunk) inFlight.delete(id);
      }
    }
  };

  return {
    request: (ids) => {
      const fresh = ids.filter((id) => !isResolved(id) && !inFlight.has(id) && !pending.has(id));
      if (fresh.length === 0) return;
      for (const id of fresh) pending.add(id);
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), debounceMs);
    },
  };
}
