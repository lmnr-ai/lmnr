import { get } from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/lib/hooks/use-toast.ts";
import { SimpleLRU } from "@/lib/simple-lru.ts";
import { convertToTimeParameters } from "@/lib/time.ts";

export interface BatchedPreviewsHook {
  previews: Record<string, any>;
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
  const fetching = useRef(new Set<string>());
  const pendingFetch = useRef(new Set<string>());
  const timer = useRef<NodeJS.Timeout | null>(null);
  const lastIdsRef = useRef<string>("");
  const [previews, setPreviews] = useState<Record<string, any>>({});
  const spanTypesRef = useRef<Record<string, string>>(spanTypes ?? {});
  const inputSpanIdsRef = useRef<string[]>(inputSpanIds ?? []);

  if (spanTypes) {
    spanTypesRef.current = spanTypes;
  }
  if (inputSpanIds) {
    inputSpanIdsRef.current = inputSpanIds;
  }

  const fetchBatch = useCallback(
    async (spanIds: string[]) => {
      if (spanIds.length === 0 || !trace?.id) return;

      const inputSpanIdSet = new Set(inputSpanIdsRef.current);
      const batchInputSpanIds = spanIds.filter((id) => inputSpanIdSet.has(id));
      const regularSpanIds = spanIds.filter((id) => !inputSpanIdSet.has(id));

      try {
        const body: Record<string, any> = {
          spanIds: regularSpanIds.length > 0 ? regularSpanIds : spanIds,
          spanTypes: spanTypesRef.current,
        };

        if (batchInputSpanIds.length > 0) {
          body.inputSpanIds = batchInputSpanIds;
          body.spanIds = [...new Set([...regularSpanIds, ...batchInputSpanIds])];
        }

        if (trace?.startTime && trace?.endTime) {
          const startTime = new Date(new Date(trace.startTime).getTime() - 1000).toISOString();
          const endTime = new Date(new Date(trace.endTime).getTime() + 1000).toISOString();

          const params = convertToTimeParameters({ startTime, endTime });
          body.startDate = params.start_time;
          body.endDate = params.end_time;
        }

        const url = isShared
          ? `/api/shared/traces/${trace.id}/spans/previews`
          : `/api/projects/${projectId}/traces/${trace.id}/spans/previews`;

        const response = await fetch(url, {
          method: "POST",
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorData = (await response.json()) as { error: string };
          throw new Error(errorData.error || "Failed to fetch span previews");
        }

        const data = (await response.json()) as {
          previews: Record<string, string | null>;
        };

        spanIds.forEach((id) => {
          cache.current.set(id, get(data.previews, id, null));
          fetching.current.delete(id);
        });

        setPreviews((prev) => {
          const next = { ...prev };
          spanIds.forEach((id) => {
            next[id] = cache.current.get(id);
          });
          return next;
        });
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

  const allIds = [...visibleSpanIds, ...(inputSpanIds ?? [])];

  useEffect(() => {
    const currentIdsKey = allIds.join(",");

    if (currentIdsKey === lastIdsRef.current) {
      return;
    }

    lastIdsRef.current = currentIdsKey;

    const newIds = allIds.filter(
      (id) => !cache.current.has(id) && !fetching.current.has(id) && !pendingFetch.current.has(id)
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
    fetching.current.clear();
    setPreviews({});
  }, []);

  return { previews, clearCache };
}
