export type LatestRequestResult<T> = { superseded: true } | { superseded: false; data: T };

export interface LatestRequest {
  /**
   * Aborts the previous request, then runs this one. Resolves `{ superseded: true }`
   * (never throws) when a later `run` or `cancel` took over, so the caller must
   * leave state alone: the newer owner sets it, loading flags included.
   */
  run: <T>(request: (signal: AbortSignal) => Promise<T>) => Promise<LatestRequestResult<T>>;
  cancel: () => void;
}

/**
 * Latest-wins request slot for state that a fetch writes into (a store, a hook's
 * table data). Create one per owner, not per module, so instances can't cancel
 * each other.
 */
export const createLatestRequest = (): LatestRequest => {
  let current: AbortController | null = null;

  const cancel = () => {
    current?.abort();
    current = null;
  };

  const run = async <T>(request: (signal: AbortSignal) => Promise<T>): Promise<LatestRequestResult<T>> => {
    cancel();
    const controller = new AbortController();
    current = controller;
    try {
      const data = await request(controller.signal);
      return current === controller ? { superseded: false, data } : { superseded: true };
    } catch (error) {
      if (current !== controller) return { superseded: true };
      throw error;
    } finally {
      if (current === controller) current = null;
    }
  };

  return { run, cancel };
};
