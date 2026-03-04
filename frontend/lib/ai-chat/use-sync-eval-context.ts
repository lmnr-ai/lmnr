"use client";

import { useEffect } from "react";

import { useAIChatStore } from "@/lib/ai-chat/store";

interface SyncEvalContextParams {
  evaluationId?: string;
  evaluationName?: string;
  selectedTraceId?: string;
  selectedDatapointId?: string;
  targetId?: string | null;
  scores?: string[];
}

/**
 * Syncs evaluation view selection state to the global AI chat store.
 * Should be placed inside evaluation view components.
 */
export function useSyncEvalContext({
  evaluationId,
  evaluationName,
  selectedTraceId,
  selectedDatapointId,
  targetId,
  scores,
}: SyncEvalContextParams) {
  const setEvaluationContext = useAIChatStore((state) => state.setEvaluationContext);
  const clearEvaluationContext = useAIChatStore((state) => state.clearEvaluationContext);

  useEffect(() => {
    if (evaluationId) {
      setEvaluationContext({
        evaluationId,
        evaluationName,
        selectedTraceId,
        selectedDatapointId,
        targetId: targetId ?? undefined,
        scores,
      });
    }

    return () => {
      clearEvaluationContext();
    };
  }, [
    evaluationId,
    evaluationName,
    selectedTraceId,
    selectedDatapointId,
    targetId,
    scores,
    setEvaluationContext,
    clearEvaluationContext,
  ]);
}
