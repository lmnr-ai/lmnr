"use client";

import { useParams } from "next/navigation";
import { useCallback, useRef } from "react";

import { useUltimateTraceViewStore, useUltimateTraceViewStoreRaw } from "./store";
import { type BlockSummary } from "./timeline/timeline-types";
import { buildTreeSkeleton, getAllCondensedBlockInputs } from "./timeline/timeline-utils";

/**
 * Hook that provides a function to generate block summaries for a trace.
 * Summaries are fetched via the API and stored in the Zustand store.
 */
export function useBlockSummaries(traceId: string) {
  const { projectId } = useParams<{ projectId: string }>();
  const storeApi = useUltimateTraceViewStoreRaw();
  const fetchedRef = useRef(false);

  const isSummarizationLoading = useUltimateTraceViewStore(
    (state) => state.traces.get(traceId)?.isSummarizationLoading ?? false
  );

  const generateBlockSummaries = useCallback(async () => {
    if (fetchedRef.current) return;

    const traceState = storeApi.getState().traces.get(traceId);
    if (!traceState?.spanTree || traceState.maxDepth === 0) return;

    const blockInputs = getAllCondensedBlockInputs(traceState.spanTree, traceState.maxDepth);
    if (blockInputs.length === 0) return;

    fetchedRef.current = true;
    storeApi.getState().setIsSummarizationLoading(traceId, true);

    try {
      const traceString = buildTreeSkeleton(traceState.spanTree);
      const res = await fetch(`/api/projects/${projectId}/traces/summarize-blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traceString, blocks: blockInputs }),
      });

      if (!res.ok) {
        console.error("Failed to generate block summaries:", res.statusText);
        return;
      }

      const results: { blockId: string; summary: string; icon: string }[] = await res.json();
      const summariesMap: Record<string, BlockSummary> = {};
      for (const r of results) {
        summariesMap[r.blockId] = { summary: r.summary, icon: r.icon };
      }

      storeApi.getState().addBlockSummaries(traceId, summariesMap);
    } catch (error) {
      console.error("Block summary generation error:", error);
      fetchedRef.current = false;
    } finally {
      storeApi.getState().setIsSummarizationLoading(traceId, false);
    }
  }, [traceId, projectId, storeApi]);

  return { generateBlockSummaries, isSummarizationLoading };
}
