import { get } from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/lib/hooks/use-toast.ts";
import { SimpleLRU } from "@/lib/simple-lru.ts";
import { convertToTimeParameters } from "@/lib/time.ts";

export interface SpanPreview {
  preview: string;
  mustacheKey: string;
}

export interface BatchedOutputsHook {
  outputs: Record<string, any>;
  previews: Record<string, SpanPreview | null>;
  clearCache: () => void;
}

interface UseBatchedSpanOutputsOptions {
  debounceMs?: number;
  maxEntries?: number;
  isShared?: boolean;
}

export function useBatchedSpanOutputs(
  projectId: string | undefined,
  visibleSpanIds: string[],
  trace: { id?: string; startTime?: string; endTime?: string },
  spanTypes?: Record<string, string>,
  options: UseBatchedSpanOutputsOptions = {}
): BatchedOutputsHook {
  const { debounceMs = 150, maxEntries = 100, isShared = false } = options;
  const { toast } = useToast();
  const cache = useRef(new SimpleLRU<string, any>(maxEntries));
  const previewCache = useRef(new SimpleLRU<string, SpanPreview | null>(maxEntries));
  const fetching = useRef(new Set<string>());
  const pendingFetch = useRef(new Set<string>());
  const timer = useRef<NodeJS.Timeout | null>(null);
  const lastIdsRef = useRef<string>("");
  const [outputs, setOutputs] = useState<Record<string, any>>({});
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

        const outputsUrl = isShared
          ? `/api/shared/traces/${trace.id}/spans/outputs`
          : `/api/projects/${projectId}/traces/${trace.id}/spans/outputs`;

        // Fire outputs request
        const outputsPromise = fetch(outputsUrl, {
          method: "POST",
          body: JSON.stringify(body),
        });

        // Fire previews request in parallel (only for non-shared, when spanTypes available)
        const currentSpanTypes = spanTypesRef.current;
        const shouldFetchPreviews = !isShared && currentSpanTypes && Object.keys(currentSpanTypes).length > 0;
        const previewsPromise = shouldFetchPreviews
          ? fetch(`/api/projects/${projectId}/traces/${trace.id}/spans/previews`, {
              method: "POST",
              body: JSON.stringify({
                ...body,
                spanTypes: currentSpanTypes,
              }),
            })
          : null;

        // Await outputs
        const outputsResponse = await outputsPromise;
        if (!outputsResponse.ok) {
          const errorData = (await outputsResponse.json()) as { error: string };
          throw new Error(errorData.error || "Failed to fetch span outputs");
        }

        const outputsData = (await outputsResponse.json()) as { outputs: Record<string, any> };

        spanIds.forEach((id) => {
          cache.current.set(id, get(outputsData.outputs, id, null));
          fetching.current.delete(id);
        });

        setOutputs((prev) => {
          const next = { ...prev };
          spanIds.forEach((id) => {
            next[id] = cache.current.get(id);
          });
          return next;
        });

        // Await previews (non-blocking — outputs are already set)
        if (previewsPromise) {
          try {
            const previewsResponse = await previewsPromise;
            if (previewsResponse.ok) {
              const previewsData = (await previewsResponse.json()) as {
                previews: Record<string, SpanPreview | null>;
              };

              spanIds.forEach((id) => {
                previewCache.current.set(id, get(previewsData.previews, id, null));
              });

              setPreviews((prev) => {
                const next = { ...prev };
                spanIds.forEach((id) => {
                  next[id] = previewCache.current.get(id) ?? null;
                });
                return next;
              });
            }
          } catch {
            // Preview failures are non-critical — outputs still display
          }
        }
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

        setOutputs((prev) => {
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
    previewCache.current.clear();
    fetching.current.clear();
    setOutputs({});
    setPreviews({});
  }, []);

  return { outputs, previews, clearCache };
}
