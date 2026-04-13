import { get } from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/lib/hooks/use-toast.ts";
import { SimpleLRU } from "@/lib/simple-lru.ts";

import { fetchSpanPreviewsForTrace } from "./fetch-span-previews";

export interface BatchedPreviewsHook {
  previews: Record<string, any>;
  userInputs: Record<string, string | null>;
  clearCache: () => void;
}

interface UseBatchedSpanPreviewsOptions {
  debounceMs?: number;
  maxEntries?: number;
  isShared?: boolean;
}

export function useBatchedSpanPreviews(
  projectId: string | undefined,
  visibleSpanIds: string[],
  trace: { id?: string; startTime?: string; endTime?: string },
  options: UseBatchedSpanPreviewsOptions = {},
  spanTypes?: Record<string, string>,
  inputSpanIds?: string[]
): BatchedPreviewsHook {
  const { debounceMs = 150, maxEntries = 100, isShared = false } = options;
  const { toast } = useToast();
  const cache = useRef(new SimpleLRU<string, any>(maxEntries));
  const inputCache = useRef(new SimpleLRU<string, string | null>(maxEntries));
  const fetching = useRef(new Set<string>());
  const pendingFetch = useRef(new Set<string>());
  const timer = useRef<NodeJS.Timeout | null>(null);
  const lastIdsRef = useRef<string>("");
  const [previews, setPreviews] = useState<Record<string, any>>({});
  const [userInputs, setUserInputs] = useState<Record<string, string | null>>({});
  const spanTypesRef = useRef<Record<string, string>>(spanTypes ?? {});
  const inputSpanIdsRef = useRef<string[]>(inputSpanIds ?? []);

  useEffect(() => {
    if (spanTypes) {
      spanTypesRef.current = spanTypes;
    }
  }, [spanTypes]);
  useEffect(() => {
    if (inputSpanIds) {
      inputSpanIdsRef.current = inputSpanIds;
    }
  }, [inputSpanIds]);

  const fetchBatch = useCallback(
    async (spanIds: string[]) => {
      if (spanIds.length === 0 || !trace?.id) return;

      const inputSpanIdSet = new Set(inputSpanIdsRef.current);
      const batchInputSpanIds = spanIds.filter((id) => inputSpanIdSet.has(id));
      const regularSpanIds = spanIds.filter((id) => !inputSpanIdSet.has(id));

      try {
        const { previews: newPreviews, userInputs: newUserInputs } = await fetchSpanPreviewsForTrace({
          projectId,
          traceId: trace.id,
          spanIds,
          inputSpanIds: batchInputSpanIds,
          spanTypes: spanTypesRef.current,
          startTime: trace.startTime,
          endTime: trace.endTime,
          isShared,
        });

        regularSpanIds.forEach((id) => {
          cache.current.set(id, get(newPreviews, id, null));
          fetching.current.delete(id);
        });

        batchInputSpanIds.forEach((id) => {
          inputCache.current.set(id, get(newUserInputs, id, null));
          fetching.current.delete(id);
        });

        setPreviews((prev) => {
          const next = { ...prev };
          regularSpanIds.forEach((id) => {
            next[id] = cache.current.get(id);
          });
          return next;
        });

        if (batchInputSpanIds.length > 0) {
          setUserInputs((prev) => {
            const next = { ...prev };
            batchInputSpanIds.forEach((id) => {
              next[id] = inputCache.current.get(id) ?? null;
            });
            return next;
          });
        }
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description:
            error instanceof Error ? error.message : "Failed to fetch span previews. Please try again later.",
        });

        spanIds.forEach((id) => {
          cache.current.set(id, null);
          fetching.current.delete(id);
        });

        setPreviews((prev) => {
          const next = { ...prev };
          spanIds.forEach((id) => {
            next[id] = null;
          });
          return next;
        });
      }
    },
    [projectId, toast, trace, isShared]
  );

  const scheduleFetch = useCallback(async () => {
    if (pendingFetch.current.size === 0) return;

    const toFetch = Array.from(pendingFetch.current);
    pendingFetch.current.clear();

    toFetch.forEach((id) => fetching.current.add(id));
    await fetchBatch(toFetch);
  }, [fetchBatch]);

  // Combine visible span IDs + input span IDs for cache check
  const allIds = [...visibleSpanIds, ...(inputSpanIds ?? [])];

  useEffect(() => {
    const currentIdsKey = allIds.join(",");

    if (currentIdsKey === lastIdsRef.current) {
      return;
    }

    lastIdsRef.current = currentIdsKey;

    const newIds = allIds.filter(
      (id) =>
        !cache.current.has(id) &&
        !inputCache.current.has(id) &&
        !fetching.current.has(id) &&
        !pendingFetch.current.has(id)
    );

    if (newIds.length > 0) {
      newIds.forEach((id) => pendingFetch.current.add(id));

      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(scheduleFetch, debounceMs);
    }
  }, [allIds, scheduleFetch, debounceMs]);

  const clearCache = useCallback(() => {
    cache.current.clear();
    inputCache.current.clear();
    fetching.current.clear();
    setPreviews({});
    setUserInputs({});
  }, []);

  return { previews, userInputs, clearCache };
}
