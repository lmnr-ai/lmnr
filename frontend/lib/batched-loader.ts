/**
 * Collects ids requested within a debounce window and loads them in fixed-size chunks.
 * Ids already resolved, queued, or in flight are skipped. A chunk whose load fails stays
 * unresolved (and is reported to `onFailed`), so a later `request` for those ids retries.
 * `invalidate` makes results already in flight for those ids stale: they are dropped and loaded again.
 */
export interface BatchedLoaderOptions<V> {
  /** Loads one chunk; `undefined` marks the chunk as failed. */
  load: (ids: string[]) => Promise<Record<string, V> | undefined>;
  /** Receives each successfully loaded chunk. */
  onLoaded: (values: Record<string, V>) => void;
  /** Receives the ids of each chunk whose load failed. */
  onFailed?: (ids: string[]) => void;
  isResolved: (id: string) => boolean;
  /** Defaults to 100, the cap the trace batch routes enforce. */
  batchSize?: number;
  debounceMs?: number;
}

export interface BatchedLoader {
  request: (ids: string[]) => void;
  /** Call after forgetting the resolved values of `ids`, when the data behind them changed. */
  invalidate: (ids: string[]) => void;
}

export function createBatchedLoader<V>({
  load,
  onLoaded,
  onFailed,
  isResolved,
  batchSize = 100,
  debounceMs = 150,
}: BatchedLoaderOptions<V>): BatchedLoader {
  const pending = new Set<string>();
  const inFlight = new Set<string>();
  const stale = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    const ids = [...pending];
    pending.clear();
    for (const id of ids) inFlight.add(id);
    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      let values: Record<string, V> | undefined;
      try {
        values = await load(chunk);
      } catch {
        // Treated like a failed load: the chunk stays unresolved for a later retry.
      } finally {
        for (const id of chunk) inFlight.delete(id);
      }
      const dropped = chunk.filter((id) => stale.delete(id));
      const kept = chunk.filter((id) => !dropped.includes(id));
      if (values) onLoaded(Object.fromEntries(Object.entries(values).filter(([id]) => !dropped.includes(id))));
      else if (kept.length > 0) onFailed?.(kept);
      request(dropped);
    }
  };

  const request = (ids: string[]) => {
    const fresh = ids.filter((id) => !isResolved(id) && !inFlight.has(id) && !pending.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) pending.add(id);
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), debounceMs);
  };

  return {
    request,
    invalidate: (ids) => {
      // Queued ids load after this call anyway; only in-flight results can be out of date.
      for (const id of ids) if (inFlight.has(id)) stale.add(id);
    },
  };
}
