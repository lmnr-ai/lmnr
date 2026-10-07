export interface IdBatchLoaderOptions<T> {
  // Max ids per fetchBatch call (server request cap).
  batchSize: number;
  // Debounce window to coalesce rapid enqueues (e.g. scroll).
  debounceMs: number;
  // Fetch one chunk (≤ batchSize ids); returns the items found.
  fetchBatch: (ids: string[]) => Promise<T[]>;
  // Stable id for an item, used to key the per-chunk result map.
  getId: (item: T) => string;
  // One successful chunk: the ids requested + found items keyed by id (misses absent).
  onBatch: (requestedIds: string[], itemsById: Map<string, T>) => void;
  // One failed chunk (fetchBatch threw).
  onError: (requestedIds: string[]) => void;
}

export interface IdBatchLoader {
  // Queue ids; coalesced + debounced, then chunked into fetchBatch calls. The
  // caller owns dedupe — the loader has no memory across flushes.
  load: (ids: string[]) => void;
  // Drop the pending window (teardown).
  cancel: () => void;
}

/**
 * Window-driven batch id loader: accumulates ids, debounces, chunks to
 * `batchSize`, and reports each chunk's result via `onBatch` / `onError`.
 * Isolates the scheduling + chunking plumbing so callers keep only their own
 * merge/state logic.
 */
export function createIdBatchLoader<T>(options: IdBatchLoaderOptions<T>): IdBatchLoader {
  const { batchSize, debounceMs, fetchBatch, getId, onBatch, onError } = options;
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    const ids = [...pending];
    pending.clear();
    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      try {
        const items = await fetchBatch(chunk);
        onBatch(chunk, new Map(items.map((item) => [getId(item), item])));
      } catch {
        onError(chunk);
      }
    }
  };

  return {
    load: (ids) => {
      if (ids.length === 0) return;
      for (const id of ids) pending.add(id);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), debounceMs);
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending.clear();
    },
  };
}
