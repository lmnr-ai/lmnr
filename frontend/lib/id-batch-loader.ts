interface IdBatchLoaderOptions<V> {
  /** Loads one chunk, keyed by id; ids it omits weren't found. Throwing fails the chunk. */
  load: (ids: string[]) => Promise<Record<string, V>>;
  onLoaded: (ids: string[], values: Record<string, V>) => void;
  onFailed: (ids: string[], error: unknown) => void;
  /** Defaults to 100, the cap the trace batch routes enforce. */
  batchSize?: number;
  debounceMs?: number;
}

/**
 * Collects ids requested within a debounce window and loads them in chunks. An id already queued or in flight
 * isn't loaded twice; once its chunk settles, a new request loads it again, so callers skip ids they already hold.
 */
export function createIdBatchLoader<V>({
  load,
  onLoaded,
  onFailed,
  batchSize = 100,
  debounceMs = 150,
}: IdBatchLoaderOptions<V>): (ids: string[]) => void {
  const pending = new Set<string>();
  const inFlight = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    const ids = [...pending];
    pending.clear();
    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      for (const id of chunk) inFlight.add(id);
      load(chunk)
        .finally(() => chunk.forEach((id) => inFlight.delete(id)))
        .then(
          (values) => onLoaded(chunk, values),
          (error: unknown) => onFailed(chunk, error)
        );
    }
  };

  return (ids) => {
    const fresh = ids.filter((id) => !pending.has(id) && !inFlight.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) pending.add(id);
    clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };
}

type Waiter<V> = { resolve: (value: V | undefined) => void; reject: (error: unknown) => void };

/**
 * One id at a time over `createIdBatchLoader`, so each caller (e.g. a visible row's SWR hook) awaits its own value
 * while the batch sends one request. Resolves `undefined` for an id the load omits; rejects with the chunk's error.
 */
export function createIdBatchFetcher<V>(
  load: (ids: string[]) => Promise<Record<string, V>>,
  options?: Pick<IdBatchLoaderOptions<V>, "batchSize" | "debounceMs">
): (id: string) => Promise<V | undefined> {
  const waiters = new Map<string, Waiter<V>[]>();
  const settle = (ids: string[], fn: (waiter: Waiter<V>, id: string) => void) => {
    for (const id of ids) {
      const forId = waiters.get(id) ?? [];
      waiters.delete(id);
      forId.forEach((w) => fn(w, id));
    }
  };
  const request = createIdBatchLoader<V>({
    load,
    onLoaded: (ids, values) => settle(ids, (w, id) => w.resolve(values[id])),
    onFailed: (ids, error) => settle(ids, (w) => w.reject(error)),
    ...options,
  });

  return (id) =>
    new Promise((resolve, reject) => {
      waiters.set(id, [...(waiters.get(id) ?? []), { resolve, reject }]);
      request([id]);
    });
}
