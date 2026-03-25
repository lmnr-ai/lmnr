import { get } from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatOutput } from "@/components/traces/trace-view/list/markdown";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { SimpleLRU } from "@/lib/simple-lru.ts";
import { convertToTimeParameters } from "@/lib/time.ts";

export interface SpanPreview {
  preview: string;
  mustacheKey: string;
  /** Whether the key was computed from the span's input or output data */
  side: "input" | "output";
}

export interface BatchedPreviewsHook {
  previews: Record<string, SpanPreview | null>;
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
  spanTypes?: Record<string, string>,
  options: UseBatchedSpanPreviewsOptions = {}
): BatchedPreviewsHook {
  const { debounceMs = 150, maxEntries = 100, isShared = false } = options;
  const { toast } = useToast();
  const cache = useRef(new SimpleLRU<string, SpanPreview | null>(maxEntries));
  const fetching = useRef(new Set<string>());
  const pendingFetch = useRef(new Set<string>());
  const timer = useRef<NodeJS.Timeout | null>(null);
  const lastIdsRef = useRef<string>("");
  const [previews, setPreviews] = useState<Record<string, SpanPreview | null>>({});
  const spanTypesRef = useRef(spanTypes);
  spanTypesRef.current = spanTypes;

  const fetchBatch = useCallback(
    async (spanIds: string[]) => {
      if (spanIds.length === 0 || !trace?.id) return;

      try {
        const body: Record<string, any> = { spanIds };

        if (trace?.startTime && trace?.endTime) {
          const startTime = new Date(new Date(trace.startTime).getTime() - 1000).toISOString();
          const endTime = new Date(new Date(trace.endTime).getTime() + 1000).toISOString();

          const params = convertToTimeParameters({ startTime, endTime });
          body.startDate = params.start_time;
          body.endDate = params.end_time;
        }

        if (isShared) {
          // In shared mode, fetch raw outputs from the shared endpoint and convert to previews
          const response = await fetch(`/api/shared/traces/${trace.id}/spans/outputs`, {
            method: "POST",
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            throw new Error("Failed to fetch span outputs");
          }

          const data = (await response.json()) as { outputs: Record<string, any> };

          spanIds.forEach((id) => {
            const output = get(data.outputs, id);
            const preview: SpanPreview | null =
              output != null ? { preview: formatOutput(output), mustacheKey: "", side: "output" } : null;
            cache.current.set(id, preview);
            fetching.current.delete(id);
          });

          setPreviews((prev) => {
            const next = { ...prev };
            spanIds.forEach((id) => {
              next[id] = cache.current.get(id) ?? null;
            });
            return next;
          });
          return;
        }

        const currentSpanTypes = spanTypesRef.current;
        const hasSpanTypes = currentSpanTypes && Object.keys(currentSpanTypes).length > 0;

        if (!hasSpanTypes) {
          // Cannot fetch previews without spanTypes
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
          return;
        }

        const response = await fetch(`/api/projects/${projectId}/traces/${trace.id}/spans/previews`, {
          method: "POST",
          body: JSON.stringify({
            ...body,
            spanTypes: currentSpanTypes,
          }),
        });

        if (!response.ok) {
          const errorData = (await response.json()) as { error: string };
          throw new Error(errorData.error || "Failed to fetch span previews");
        }

        const data = (await response.json()) as {
          previews: Record<string, SpanPreview | null>;
        };

        spanIds.forEach((id) => {
          cache.current.set(id, get(data.previews, id, null));
          fetching.current.delete(id);
        });

        setPreviews((prev) => {
          const next = { ...prev };
          spanIds.forEach((id) => {
            next[id] = cache.current.get(id) ?? null;
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

  const clearCache = useCallback(() => {
    cache.current.clear();
    fetching.current.clear();
    setPreviews({});
  }, []);

  return { previews, clearCache };
}
