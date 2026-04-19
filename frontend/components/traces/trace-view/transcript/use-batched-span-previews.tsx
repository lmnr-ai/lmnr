import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/lib/hooks/use-toast.ts";
import { convertToTimeParameters } from "@/lib/time.ts";

export interface BatchedPreviewsHook {
  previews: Record<string, string | null>;
  inputPreviews: Record<string, string | null>;
  agentNames: Record<string, string | null>;
  clearCache: () => void;
}

interface UseBatchedSpanPreviewsOptions {
  debounceMs?: number;
  isShared?: boolean;
}

/**
 * Batches span-preview requests behind a debounce. Tracks output and input
 * fetches independently so a span first seen as a plain row (output only)
 * correctly fetches its input when the transcript structure later promotes it
 * into a subagent group header — otherwise the shared ID would short-circuit
 * the input request and leave group-input rows stuck loading.
 */
export function useBatchedSpanPreviews(
  projectId: string | undefined,
  visibleSpanIds: string[],
  trace: { id?: string; startTime?: string; endTime?: string },
  options: UseBatchedSpanPreviewsOptions = {},
  spanTypes?: Record<string, string>,
  inputSpanIds?: string[],
  promptHashes?: Record<string, string>
): BatchedPreviewsHook {
  const { debounceMs = 150, isShared = false } = options;
  const { toast } = useToast();

  // Union of "pending + in-flight + successfully fetched" per role. The React
  // state objects below are the fetched-set (keyed by `id in previews`). These
  // refs add the pending/in-flight layer so we don't re-queue the same ID.
  const requestedOutputs = useRef(new Set<string>());
  const requestedInputs = useRef(new Set<string>());
  const pendingOutputs = useRef(new Set<string>());
  const pendingInputs = useRef(new Set<string>());

  const timer = useRef<NodeJS.Timeout | null>(null);

  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [inputPreviews, setInputPreviews] = useState<Record<string, string | null>>({});
  const [agentNames, setAgentNames] = useState<Record<string, string | null>>({});

  // Pass-through state refs so fetchBatch always reads the latest values
  // without being rebuilt on every parent render.
  const spanTypesRef = useRef(spanTypes ?? {});
  const promptHashesRef = useRef(promptHashes ?? {});
  spanTypesRef.current = spanTypes ?? spanTypesRef.current;
  promptHashesRef.current = promptHashes ?? promptHashesRef.current;

  const runFetch = useCallback(async () => {
    const outputIds = [...pendingOutputs.current];
    const inputIds = [...pendingInputs.current];
    pendingOutputs.current.clear();
    pendingInputs.current.clear();

    if (!trace?.id || (outputIds.length === 0 && inputIds.length === 0)) return;

    const spanIds = [...new Set([...outputIds, ...inputIds])];

    const body: Record<string, unknown> = {
      spanIds,
      spanTypes: spanTypesRef.current,
    };

    if (inputIds.length > 0) {
      body.inputSpanIds = inputIds;
      const batchHashes: Record<string, string> = {};
      for (const id of inputIds) {
        const hash = promptHashesRef.current[id];
        if (hash) batchHashes[id] = hash;
      }
      if (Object.keys(batchHashes).length > 0) body.promptHashes = batchHashes;
    }

    if (trace.startTime && trace.endTime) {
      const params = convertToTimeParameters({
        startTime: new Date(new Date(trace.startTime).getTime() - 1000).toISOString(),
        endTime: new Date(new Date(trace.endTime).getTime() + 1000).toISOString(),
      });
      body.startDate = params.start_time;
      body.endDate = params.end_time;
    }

    const url = isShared
      ? `/api/shared/traces/${trace.id}/spans/previews`
      : `/api/projects/${projectId}/traces/${trace.id}/spans/previews`;

    try {
      const res = await fetch(url, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) {
        const errData = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errData?.error ?? "Failed to fetch span previews");
      }
      const data = (await res.json()) as {
        previews: Record<string, string | null>;
        inputPreviews?: Record<string, string | null>;
        agentNames?: Record<string, string | null>;
      };

      if (outputIds.length > 0) {
        setPreviews((prev) => {
          const next = { ...prev };
          for (const id of outputIds) next[id] = data.previews?.[id] ?? null;
          return next;
        });
      }
      if (inputIds.length > 0) {
        setInputPreviews((prev) => {
          const next = { ...prev };
          for (const id of inputIds) next[id] = data.inputPreviews?.[id] ?? null;
          return next;
        });
        if (data.agentNames) {
          setAgentNames((prev) => ({ ...prev, ...data.agentNames }));
        }
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch span previews.",
      });
      if (outputIds.length > 0) {
        setPreviews((prev) => {
          const next = { ...prev };
          for (const id of outputIds) next[id] = null;
          return next;
        });
      }
      if (inputIds.length > 0) {
        setInputPreviews((prev) => {
          const next = { ...prev };
          for (const id of inputIds) if (!(id in next)) next[id] = null;
          return next;
        });
      }
    }
  }, [projectId, toast, trace, isShared]);

  useEffect(() => {
    let queued = false;

    for (const id of visibleSpanIds) {
      if (requestedOutputs.current.has(id)) continue;
      requestedOutputs.current.add(id);
      pendingOutputs.current.add(id);
      queued = true;
    }

    for (const id of inputSpanIds ?? []) {
      if (requestedInputs.current.has(id)) continue;
      requestedInputs.current.add(id);
      pendingInputs.current.add(id);
      queued = true;
    }

    if (!queued) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(runFetch, debounceMs);
  }, [visibleSpanIds, inputSpanIds, runFetch, debounceMs]);

  const clearCache = useCallback(() => {
    requestedOutputs.current.clear();
    requestedInputs.current.clear();
    pendingOutputs.current.clear();
    pendingInputs.current.clear();
    setPreviews({});
    setInputPreviews({});
    setAgentNames({});
  }, []);

  return { previews, inputPreviews, agentNames, clearCache };
}
