import { useCallback, useEffect, useRef, useState } from "react";

import { TraceViewTrace } from "@/components/traces/trace-view/trace-view-store.tsx";

import { SimpleLRU } from "./simple-lru";

export interface BatchedOutputsHook {
  getOutput: (spanId: string) => any | undefined;
  clearCache: () => void;
}

interface UseBatchedSpanOutputsOptions {
  debounceMs?: number;
  maxEntries?: number;
}

export function useBatchedSpanOutputs(
  projectId: string,
  visibleSpanIds: string[],
  trace?: Pick<TraceViewTrace, "id" | "startTime" | "endTime">,
  options: UseBatchedSpanOutputsOptions = {}
): BatchedOutputsHook {
  const { debounceMs = 150, maxEntries = 100 } = options;

  const cache = useRef(new SimpleLRU<string, any>(maxEntries));
  const fetching = useRef(new Set<string>());
  const pendingFetch = useRef(new Set<string>());
  const timer = useRef<NodeJS.Timeout | null>(null);
  const lastIdsRef = useRef<string>("");
  const [, setUpdateTrigger] = useState(0);

  const fetchBatch = useCallback(
    async (spanIds: string[]) => {
      if (spanIds.length === 0 || !trace) return;

      try {
        const startDate = new Date(new Date(trace.startTime).getTime() - 1000);
        const endDate = new Date(new Date(trace.endTime).getTime() + 1000);

        const response = await fetch(`/api/projects/${projectId}/traces/${trace.id}/spans/outputs`, {
          method: "POST",
          body: JSON.stringify({ spanIds, startDate, endDate }),
        });

        if (!response.ok) {
          const errorData = (await response.json()) as { error: string };
          throw new Error(errorData.error || "Failed to fetch span outputs");
        }

        const data = await response.json();

        spanIds.forEach((id) => {
          cache.current.set(id, data.outputs[id]);
          fetching.current.delete(id);
        });

        setUpdateTrigger((prev) => prev + 1);
      } catch (error) {
        console.error("Error fetching batched span outputs:", error);

        spanIds.forEach((id) => {
          cache.current.set(id, null);
          fetching.current.delete(id);
        });

        setUpdateTrigger((prev) => prev + 1);
      }
    },
    [projectId, trace]
  );

  const scheduleFetch = useCallback(async () => {
    if (pendingFetch.current.size === 0) return;

    const toFetch = Array.from(pendingFetch.current);
    pendingFetch.current.clear();

    toFetch.forEach((id) => fetching.current.add(id));
    await fetchBatch(toFetch);
  }, [fetchBatch]);

  useEffect(() => {
    const currentIdsKey = visibleSpanIds.join(",");

    if (currentIdsKey === lastIdsRef.current) {
      return;
    }

    lastIdsRef.current = currentIdsKey;

    const newIds = visibleSpanIds.filter(
      (id) => !cache.current.has(id) && !fetching.current.has(id) && !pendingFetch.current.has(id)
    );

    if (newIds.length > 0) {
      newIds.forEach((id) => pendingFetch.current.add(id));

      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(scheduleFetch, debounceMs);
    }
  }, [visibleSpanIds, scheduleFetch, debounceMs]);

  const getOutput = useCallback((spanId: string) => cache.current.get(spanId), []);

  const clearCache = useCallback(() => {
    cache.current.clear();
    fetching.current.clear();
    setUpdateTrigger((prev) => prev + 1);
  }, []);

  // useEffect(() => {
  //   cache.current.clear();
  //   fetching.current.clear();
  //   pendingFetch.current.clear();
  //   lastIdsRef.current = "";
  //   if (timer.current) {
  //     clearTimeout(timer.current);
  //   }
  // }, [trace?.id]);

  return { getOutput, clearCache };
}
