/**
 * Tracks the generation of the current table query.
 *
 * A response may outlive the query that started it (for example, when a
 * realtime event triggers a refetch while a pagination request is pending).
 * Callers claim a request slot before starting work and apply the result only
 * if `isCurrent()` still returns true when the work completes.
 */
export interface RequestToken {
  generation: number;
  requestId: number;
}

export interface LatestRequestGate {
  invalidate: () => number;
  getGeneration: () => number;
  isGenerationCurrent: (generation: number) => boolean;
  beginRequest: () => RequestToken | null;
  isCurrent: (request: RequestToken) => boolean;
  finishRequest: (request: RequestToken) => void;
}

export function createLatestRequestGate(): LatestRequestGate {
  let currentGeneration = 0;
  let nextRequestId = 0;
  let activeRequestId: number | null = null;

  return {
    invalidate: () => {
      currentGeneration += 1;
      activeRequestId = null;
      return currentGeneration;
    },
    getGeneration: () => currentGeneration,
    isGenerationCurrent: (generation) => generation === currentGeneration,
    beginRequest: () => {
      if (activeRequestId !== null) return null;

      const requestId = ++nextRequestId;
      activeRequestId = requestId;
      return { generation: currentGeneration, requestId };
    },
    isCurrent: ({ generation, requestId }) => generation === currentGeneration && requestId === activeRequestId,
    finishRequest: ({ requestId }) => {
      if (requestId === activeRequestId) activeRequestId = null;
    },
  };
}
