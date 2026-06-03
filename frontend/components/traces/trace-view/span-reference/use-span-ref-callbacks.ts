"use client";

import { useCallback, useMemo } from "react";

import { type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { type SpanType } from "@/lib/traces/types";

export function useSpanRefCallbacks({
  spans,
  onSelectSpan,
}: {
  spans: TraceViewSpan[];
  onSelectSpan: (spanUuid: string) => void;
}): SpanReferenceCallbacks {
  const resolveSpanId = useCallback(
    async (shortId: string): Promise<{ uuid: string; type: SpanType } | null> => {
      const suffix = shortId.toLowerCase();
      const local = spans.find((s) => s.spanId.toLowerCase().endsWith(suffix));
      if (local) {
        return { uuid: local.spanId, type: local.spanType };
      }
      return null;
    },
    [spans]
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
