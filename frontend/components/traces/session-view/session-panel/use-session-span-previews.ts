import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSpanPreviewsForTrace } from "@/components/traces/trace-view/transcript/fetch-span-previews";
import { useToast } from "@/lib/hooks/use-toast";
import { SimpleLRU } from "@/lib/simple-lru";

/** Trace metadata needed to issue a preview request. */
export interface SessionPreviewTrace {
  id: string;
  startTime: string;
  endTime: string;
}

export interface UseSessionSpanPreviewsInput {
  projectId: string | undefined;
  /** Traces in the session, used for URL + time-window lookup. */
  traces: SessionPreviewTrace[];
  /** Span IDs currently visible in the session-panel virtualizer, grouped by trace. */
  visibleSpanIdsByTrace: Record<string, string[]>;
  /** Subset of spanIds (per trace) to fetch as `userInputs` — typically the
   *  first-LLM spanId for each reader-mode agent group. */
  inputSpanIdsByTrace?: Record<string, string[]>;
  /** spanId → spanType hint map, per trace. Optional — server has defaults. */
  spanTypesByTrace?: Record<string, Record<string, string>>;
  options?: {
    debounceMs?: number;
    maxEntries?: number;
    isShared?: boolean;
  };
}

export interface UseSessionSpanPreviewsResult {
  /** Flat map spanId → preview. Safe because span IDs are globally unique. */
  previews: Record<string, any>;
  /** Flat map spanId → user input. */
  userInputs: Record<string, string | null>;
  /** Flat map spanId → agent name. */
  agentNames: Record<string, string | null>;
  clearCache: () => void;
}

/**
 * Session-scoped batched preview fetcher. Mirrors `useBatchedSpanPreviews` for
 * trace-view but operates across multiple traces at once: one POST per trace
 * per debounce flush, fired in parallel.
 *
 * - Single shared LRU cache keyed by `spanId` (UUIDs are globally unique).
 * - Single debounce across all traces.
 * - One error toast per failed trace per flush (dedup'd).
 *
 * Flag: cache lives in a `useRef`, so unmounting the SessionPanel drops the
 * cache. Acceptable for v1 — hoist into the zustand store if we want it to
 * persist across panel close/reopen.
 */
export function useSessionSpanPreviews({
  projectId,
  traces,
  visibleSpanIdsByTrace,
  inputSpanIdsByTrace,
  spanTypesByTrace,
  options,
}: UseSessionSpanPreviewsInput): UseSessionSpanPreviewsResult {
  const { debounceMs = 150, maxEntries = 500, isShared = false } = options ?? {};
  const { toast } = useToast();

  const cache = useRef(new SimpleLRU<string, any>(maxEntries));
  const inputCache = useRef(new SimpleLRU<string, string | null>(maxEntries));
  const agentNameCache = useRef(new SimpleLRU<string, string | null>(maxEntries));
  const fetching = useRef(new Set<string>());
  // Pending IDs grouped by trace, with each entry separated into regular vs.
  // input so the fetcher routes them correctly.
  const pendingByTrace = useRef(new Map<string, { regular: Set<string>; input: Set<string> }>());
  const timer = useRef<NodeJS.Timeout | null>(null);
  const lastKeyRef = useRef<string>("");

  const [previews, setPreviews] = useState<Record<string, any>>({});
  const [userInputs, setUserInputs] = useState<Record<string, string | null>>({});
  const [agentNames, setAgentNames] = useState<Record<string, string | null>>({});

  // Stable lookup for startTime/endTime per traceId.
  const tracesById = useRef<Map<string, SessionPreviewTrace>>(new Map());
  useEffect(() => {
    tracesById.current = new Map(traces.map((t) => [t.id, t]));
  }, [traces]);

  // Refs for values that change every render but shouldn't trigger re-fetches.
  const spanTypesByTraceRef = useRef<Record<string, Record<string, string>>>(spanTypesByTrace ?? {});
  useEffect(() => {
    spanTypesByTraceRef.current = spanTypesByTrace ?? {};
  }, [spanTypesByTrace]);

  const scheduleFetch = useCallback(async () => {
    if (pendingByTrace.current.size === 0) return;

    const work: Array<{ traceId: string; regular: string[]; input: string[] }> = [];
    for (const [traceId, { regular, input }] of pendingByTrace.current.entries()) {
      work.push({
        traceId,
        regular: Array.from(regular),
        input: Array.from(input),
      });
    }
    pendingByTrace.current.clear();

    // Mark everything as in-flight so dedupe checks skip them.
    for (const { regular, input } of work) {
      for (const id of regular) fetching.current.add(id);
      for (const id of input) fetching.current.add(id);
    }

    let errored = false;

    await Promise.all(
      work.map(async ({ traceId, regular, input }) => {
        const trace = tracesById.current.get(traceId);
        if (!trace) return;

        const allIds = Array.from(new Set([...regular, ...input]));

        try {
          const {
            previews: newPreviews,
            userInputs: newUserInputs,
            agentNames: newAgentNames,
          } = await fetchSpanPreviewsForTrace({
            projectId,
            traceId,
            spanIds: allIds,
            inputSpanIds: input,
            spanTypes: spanTypesByTraceRef.current[traceId],
            startTime: trace.startTime,
            endTime: trace.endTime,
            isShared,
          });

          for (const id of regular) {
            cache.current.set(id, newPreviews[id] ?? null);
            fetching.current.delete(id);
          }
          for (const id of input) {
            inputCache.current.set(id, newUserInputs[id] ?? null);
            fetching.current.delete(id);
          }

          if (regular.length > 0) {
            setPreviews((prev) => {
              const next = { ...prev };
              for (const id of regular) next[id] = cache.current.get(id) ?? null;
              return next;
            });
          }
          if (input.length > 0) {
            setUserInputs((prev) => {
              const next = { ...prev };
              for (const id of input) next[id] = inputCache.current.get(id) ?? null;
              return next;
            });
          }
          if (Object.keys(newAgentNames).length > 0) {
            for (const [id, name] of Object.entries(newAgentNames)) {
              agentNameCache.current.set(id, name);
            }
            setAgentNames((prev) => ({ ...prev, ...newAgentNames }));
          }
        } catch {
          errored = true;
          for (const id of allIds) {
            cache.current.set(id, null);
            fetching.current.delete(id);
          }
          setPreviews((prev) => {
            const next = { ...prev };
            for (const id of regular) next[id] = null;
            return next;
          });
        }
      })
    );

    if (errored) {
      // One toast per flush regardless of how many traces failed — otherwise a
      // disconnected network would spam the user.
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch some span previews. Please try again later.",
      });
    }
  }, [projectId, isShared, toast]);

  useEffect(() => {
    // Build a stable key so we only enqueue when the input set truly changes.
    // (Parent memoizes maps, but defensive against reference churn.)
    const parts: string[] = [];
    for (const [tid, ids] of Object.entries(visibleSpanIdsByTrace)) {
      if (ids.length === 0) continue;
      parts.push(`${tid}:${[...ids].sort().join(",")}`);
    }
    if (inputSpanIdsByTrace) {
      for (const [tid, ids] of Object.entries(inputSpanIdsByTrace)) {
        if (ids.length === 0) continue;
        parts.push(`${tid}!${[...ids].sort().join(",")}`);
      }
    }
    const key = parts.sort().join("|");
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    let added = false;
    for (const [traceId, spanIds] of Object.entries(visibleSpanIdsByTrace)) {
      const inputIds = new Set(inputSpanIdsByTrace?.[traceId] ?? []);
      const allIds = new Set<string>([...spanIds, ...inputIds]);

      for (const id of allIds) {
        const isInput = inputIds.has(id);
        const already = isInput ? inputCache.current.has(id) : cache.current.has(id);
        if (already) continue;
        if (fetching.current.has(id)) continue;

        const entry = pendingByTrace.current.get(traceId) ?? { regular: new Set<string>(), input: new Set<string>() };
        if (isInput) entry.input.add(id);
        else entry.regular.add(id);
        pendingByTrace.current.set(traceId, entry);
        added = true;
      }
    }

    if (added) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(scheduleFetch, debounceMs);
    }
  }, [visibleSpanIdsByTrace, inputSpanIdsByTrace, scheduleFetch, debounceMs]);

  const clearCache = useCallback(() => {
    cache.current.clear();
    inputCache.current.clear();
    agentNameCache.current.clear();
    fetching.current.clear();
    pendingByTrace.current.clear();
    setPreviews({});
    setUserInputs({});
    setAgentNames({});
  }, []);

  return { previews, userInputs, agentNames, clearCache };
}
