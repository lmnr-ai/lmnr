"use client";

import { useCallback, useMemo } from "react";

import { type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { type SpanType } from "@/lib/traces/types";

/**
 * Shared wiring for `renderSpanReferences` inside a single trace view (chat and
 * the signal-events panel). The callbacks resolve against the already-loaded
 * store spans and select within the current trace:
 *   - `resolveSpanId` — sequential id → uuid + type, resolved locally from the
 *     loaded store spans when available, falling back to the agent endpoint only
 *     when the spans list isn't loaded yet.
 *   - `getSpanType` — sync uuid → type from the already-loaded store spans
 *   - `onSelectSpan` — caller-supplied span navigation (within the current trace)
 *
 * Contexts without a loaded spans list (e.g. the signal events table) build
 * their own callbacks instead of using this hook.
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
  // Sequential id is the 1-based position of the span ordered by start time —
  // same ordering the resolve-span endpoint uses, so we can resolve it locally.
  const spansByStartTime = useMemo(() => [...spans].sort((a, b) => a.startTime.localeCompare(b.startTime)), [spans]);

  const resolveSpanId = useCallback(
    async (sequentialId: string): Promise<{ uuid: string; type: SpanType } | null> => {
      const local = spansByStartTime[Number(sequentialId) - 1];
      if (local) {
        return { uuid: local.spanId, type: local.spanType };
      }

      // No local access (spans not loaded yet) — fall back to the endpoint.
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
    [projectId, traceId, spansByStartTime]
  );

  const spanTypeByUuid = useMemo(() => {
    const m = new Map<string, SpanType>();
    for (const s of spans) m.set(s.spanId, s.spanType);
    return m;
  }, [spans]);
  const getSpanType = useCallback((uuid: string) => spanTypeByUuid.get(uuid), [spanTypeByUuid]);

  return useMemo<SpanReferenceCallbacks>(
    () => ({
      resolveSpanId,
      getSpanType,
      onSelectSpan: ({ spanId }) => {
        if (spanId) onSelectSpan(spanId);
      },
    }),
    [resolveSpanId, getSpanType, onSelectSpan]
  );
}
