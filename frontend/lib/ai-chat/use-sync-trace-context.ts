"use client";

import { useEffect } from "react";

import { useAIChatStore } from "@/lib/ai-chat/store";

interface SyncTraceContextParams {
  traceId?: string;
  traceStartTime?: string;
  traceEndTime?: string;
  traceStatus?: string;
  selectedSpanId?: string;
  selectedSpanName?: string;
}

/**
 * Syncs trace view selection state to the global AI chat store.
 * Should be placed inside trace view components.
 */
export function useSyncTraceContext({
  traceId,
  traceStartTime,
  traceEndTime,
  traceStatus,
  selectedSpanId,
  selectedSpanName,
}: SyncTraceContextParams) {
  const setTraceViewContext = useAIChatStore((state) => state.setTraceViewContext);
  const clearTraceViewContext = useAIChatStore((state) => state.clearTraceViewContext);

  useEffect(() => {
    if (traceId) {
      setTraceViewContext({
        traceId,
        traceStartTime,
        traceEndTime,
        traceStatus,
        selectedSpanId,
        selectedSpanName,
      });
    }

    return () => {
      clearTraceViewContext();
    };
  }, [
    traceId,
    traceStartTime,
    traceEndTime,
    traceStatus,
    selectedSpanId,
    selectedSpanName,
    setTraceViewContext,
    clearTraceViewContext,
  ]);
}
