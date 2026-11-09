type Waiter<V> = { resolve: (value: V | undefined) => void; reject: (error: unknown) => void };

/**
 * Turns one-id lookups made within `delayMs` of each other into chunked bulk loads, so each visible turn can ask for
 * its own reply while the thread sends one request. Ids missing from a chunk's result resolve to `undefined`; a failed
 * chunk rejects every id in it.
 */
export function createIdBatcher<V>(
  loadChunk: (ids: string[]) => Promise<Record<string, V>>,
  { delayMs = 50, chunkSize = 100 } = {}
) {
  let queue = new Map<string, Waiter<V>[]>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    const batch = queue;
    queue = new Map();
    timer = undefined;
    const ids = [...batch.keys()];
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const each = (fn: (w: Waiter<V>, id: string) => void) =>
        chunk.forEach((id) => batch.get(id)?.forEach((w) => fn(w, id)));
      loadChunk(chunk).then(
        (values) => each((w, id) => w.resolve(values[id])),
        (error: unknown) => each((w) => w.reject(error))
      );
    }
  };

  return (id: string) =>
    new Promise<V | undefined>((resolve, reject) => {
      queue.set(id, [...(queue.get(id) ?? []), { resolve, reject }]);
      timer ??= setTimeout(flush, delayMs);
    });
}
