"use client";

import { useCallback, useMemo } from "react";

import { type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { type SpanType } from "@/lib/traces/types";

/**
 * Shared wiring for `renderSpanReferences`. Both the in-trace Chat and the
 * signal-events panel build the same callback bundle:
 *   - `resolveSpanId` — async sequential id → uuid + type via the agent endpoint
 *   - `getSpanType` — sync uuid → type from the already-loaded store spans
 *   - `onSelectSpan` — caller-supplied span navigation
 *
 * Keeping this in one place means an API-shape change to `/agent/resolve-span`
 * only needs to be patched once.
 */
export function useSpanRefCallbacks({
  projectId,
  traceId,
  spans,
  onSelectSpan,
}: {
  projectId: string;
  traceId: string;
  spans: TraceViewSpan[];
  onSelectSpan: (spanUuid: string) => void;
}): SpanReferenceCallbacks {
  const resolveSpanId = useCallback(
    async (sequentialId: string): Promise<{ uuid: string; type: SpanType } | null> => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/traces/${traceId}/agent/resolve-span?id=${sequentialId}`
        );
        if (response.ok) {
          const data = (await response.json()) as { spanId: string; spanType: SpanType };
          return { uuid: data.spanId, type: data.spanType };
        }
      } catch (error) {
        console.error("Error resolving span ID:", error);
      }
      return null;
    },
    [projectId, traceId]
  );

  const spanTypeByUuid = useMemo(() => {
    const m = new Map<string, SpanType>();
    for (const s of spans) m.set(s.spanId, s.spanType);
    return m;
  }, [spans]);
  const getSpanType = useCallback((uuid: string) => spanTypeByUuid.get(uuid), [spanTypeByUuid]);

  return useMemo<SpanReferenceCallbacks>(
    () => ({ resolveSpanId, getSpanType, onSelectSpan }),
    [resolveSpanId, getSpanType, onSelectSpan]
  );
}
