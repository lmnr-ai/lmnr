import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/lib/hooks/use-toast";
import { SimpleLRU } from "@/lib/simple-lru";
import { type Span } from "@/lib/traces/types";

export type TraceIOEntry = {
  /** Extracted user-input text for the trace's main agent path. Render via a
   *  synthetic "user" pill (no backing span). */
  inputPreview: string | null;
  /** Final LLM output text on the main agent path. Pairs with `outputSpan`. */
  outputPreview: string | null;
  /** Full span payload for the last LLM span on the main agent path, for
   *  selectable rendering (e.g. as a `ListItem`). */
  outputSpan: Span | null;
  /** Total span count for the trace. Only populated when the hook is called
   *  with `isIncludeSpanCounts: true`; `undefined` otherwise. */
  spanCount?: number;
};

interface UseBatchedTraceIOOptions {
  debounceMs?: number;
  maxEntries?: number;
  /** If true, also hits `/traces/span-count` for the same batch and merges
   *  `spanCount` into each entry. Fetches run in parallel; span-count failure
   *  is non-fatal (entries still land with IO data minus `spanCount`). */
  isIncludeSpanCounts?: boolean;
}

export function useBatchedTraceIO(
  projectId: string | undefined,
  visibleTraceIds: string[],
  options: UseBatchedTraceIOOptions = {}
) {
  const { debounceMs = 200, maxEntries = 200, isIncludeSpanCounts = false } = options;
  // FLAG: `isIncludeSpanCounts` is read only when a batch is actually dispatched.
  // Toggling this mid-lifecycle will NOT retroactively populate `spanCount` for
  // traces already cached (no cache invalidation on option change). Keep it
  // stable per component lifetime, or remount to rehydrate.
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

      const postJson = (path: string) =>
        fetch(`/api/projects/${projectId}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ traceIds }),
        });

      // Fire both requests in parallel. `allSettled` so a span-count failure
      // doesn't block IO data from landing (IO is the primary payload).
      const [ioSettled, countSettled] = await Promise.allSettled([
        postJson("/traces/io"),
        isIncludeSpanCounts ? postJson("/traces/span-count") : Promise.resolve(null),
      ]);

      try {
        if (ioSettled.status !== "fulfilled" || !ioSettled.value.ok) {
          const errMsg =
            ioSettled.status === "fulfilled"
              ? await ioSettled.value
                  .json()
                  .then((d: { error?: string }) => d?.error)
                  .catch(() => null)
              : null;
          throw new Error(errMsg ?? "Failed to fetch trace previews");
        }

        const ioData = (await ioSettled.value.json()) as Record<string, TraceIOEntry>;

        let countData: Record<string, number> = {};
        if (countSettled.status === "fulfilled" && countSettled.value && countSettled.value.ok) {
          countData = await countSettled.value.json().catch(() => ({}));
        }

        for (const id of traceIds) {
          const entry = ioData[id] ?? null;
          const merged = entry && isIncludeSpanCounts ? { ...entry, spanCount: countData[id] ?? 0 } : entry;
          cache.current.set(id, merged);
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
    [projectId, toast, isIncludeSpanCounts]
  );

  const scheduleFetch = useCallback(async () => {
    if (pendingFetch.current.size === 0) return;

    const toFetch = Array.from(pendingFetch.current);
    pendingFetch.current.clear();

    for (const id of toFetch) fetching.current.add(id);

    // Server enforces max 100 IDs per request
    for (let i = 0; i < toFetch.length; i += 100) {
      await fetchBatch(toFetch.slice(i, i + 100));
    }
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
