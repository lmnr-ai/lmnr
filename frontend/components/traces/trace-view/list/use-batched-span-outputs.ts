import { get } from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/lib/hooks/use-toast.ts";
import { convertToTimeParameters } from "@/lib/time.ts";

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
  trace: { id: string; startTime?: string; endTime?: string },
  options: UseBatchedSpanOutputsOptions = {}
): BatchedOutputsHook {
  const { debounceMs = 150, maxEntries = 100 } = options;
  const { toast } = useToast();
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
        const body: Record<string, any> = { spanIds };

        if (trace?.startTime && trace?.endTime) {
          const startTime = new Date(new Date(trace.startTime).getTime() - 1000).toISOString();
          const endTime = new Date(new Date(trace.endTime).getTime() + 1000).toISOString();

          const params = convertToTimeParameters({ startTime, endTime });
          body.startDate = params.start_time;
          body.endDate = params.end_time;
        }

        const response = await fetch(`/api/projects/${projectId}/traces/${trace.id}/spans/outputs`, {
          method: "POST",
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorData = (await response.json()) as { error: string };
          throw new Error(errorData.error || "Failed to fetch span outputs");
        }

        const data = (await response.json()) as { outputs: Record<string, any> };

        spanIds.forEach((id) => {
          cache.current.set(id, get(data.outputs, id, null));
          fetching.current.delete(id);
        });

        setUpdateTrigger((prev) => prev + 1);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to fetch span outputs. Please try again later.",
        });

        spanIds.forEach((id) => {
          cache.current.set(id, null);
          fetching.current.delete(id);
        });

        setUpdateTrigger((prev) => prev + 1);
      }
    },
    [projectId, toast, trace]
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

  return { getOutput, clearCache };
}
