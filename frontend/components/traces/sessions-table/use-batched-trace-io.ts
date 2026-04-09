import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/lib/hooks/use-toast";
import { SimpleLRU } from "@/lib/simple-lru";

export type TraceIOEntry = { input: string | null; output: string | null };

interface UseBatchedTraceIOOptions {
  debounceMs?: number;
  maxEntries?: number;
}

export function useBatchedTraceIO(
  projectId: string | undefined,
  visibleTraceIds: string[],
  options: UseBatchedTraceIOOptions = {}
) {
  const { debounceMs = 200, maxEntries = 200 } = options;
  const { toast } = useToast();
  const cache = useRef(new SimpleLRU<string, TraceIOEntry | null>(maxEntries));
  const fetching = useRef(new Set<string>());
  const pendingFetch = useRef(new Set<string>());
  const timer = useRef<NodeJS.Timeout | null>(null);
  const lastIdsRef = useRef("");
  const [previews, setPreviews] = useState<Record<string, TraceIOEntry | null>>({});

  const fetchBatch = useCallback(
    async (traceIds: string[]) => {
      if (traceIds.length === 0 || !projectId) return;

      try {
        const response = await fetch(`/api/projects/${projectId}/traces/io`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ traceIds }),
        });

        if (!response.ok) {
          const errData = await response
            .json()
            .then((d: { error?: string }) => d?.error)
            .catch(() => null);
          throw new Error(errData ?? "Failed to fetch trace previews");
        }

        const data = (await response.json()) as Record<string, TraceIOEntry>;

        for (const id of traceIds) {
          cache.current.set(id, data[id] ?? null);
          fetching.current.delete(id);
        }

        setPreviews((prev) => {
          const next = { ...prev };
          for (const id of traceIds) {
            next[id] = cache.current.get(id) ?? null;
          }
          return next;
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: error instanceof Error ? error.message : "Failed to fetch trace previews",
        });

        for (const id of traceIds) {
          fetching.current.delete(id);
        }
      }
    },
    [projectId, toast]
  );

  const scheduleFetch = useCallback(async () => {
    if (pendingFetch.current.size === 0) return;

    const toFetch = Array.from(pendingFetch.current);
    pendingFetch.current.clear();

    for (const id of toFetch) fetching.current.add(id);
    await fetchBatch(toFetch);
  }, [fetchBatch]);

  useEffect(() => {
    const currentIdsKey = visibleTraceIds.join(",");

    if (currentIdsKey === lastIdsRef.current) return;
    lastIdsRef.current = currentIdsKey;

    // All sessions collapsed / reset — drop cached state so we don't hold stale memory
    if (visibleTraceIds.length === 0) {
      cache.current.clear();
      fetching.current.clear();
      pendingFetch.current.clear();
      if (timer.current) clearTimeout(timer.current);
      setPreviews({});
      return;
    }

    const newIds = visibleTraceIds.filter(
      (id) => !cache.current.has(id) && !fetching.current.has(id) && !pendingFetch.current.has(id)
    );

    if (newIds.length > 0) {
      for (const id of newIds) pendingFetch.current.add(id);

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(scheduleFetch, debounceMs);
    }
  }, [visibleTraceIds, scheduleFetch, debounceMs]);

  return { previews };
}
