import { useMemo } from "react";

import { type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { type SpanType, type TraceRow } from "@/lib/traces/types";

/**
 * Resolves the agent's `<span id='abc123' …/>` refs (span-id suffixes) against the tested trace,
 * and opens the referenced span in the trace view in a new tab.
 */
export default function useTestSpanRefs(projectId: string, trace: TraceRow | null): SpanReferenceCallbacks {
  return useMemo<SpanReferenceCallbacks>(() => {
    let spansPromise: Promise<TraceViewSpan[]> | null = null;
    const loadSpans = () => {
      if (!trace) return Promise.resolve([]);
      // One fetch shared by every ref in the result; a failure resets so a later ref can retry.
      spansPromise ??= (async () => {
        const params = new URLSearchParams({
          startDate: new Date(new Date(trace.startTime).getTime() - 1000).toISOString(),
          endDate: new Date(new Date(trace.endTime).getTime() + 1000).toISOString(),
        });
        const res = await fetch(`/api/projects/${projectId}/traces/${trace.id}/spans?${params}`);
        if (!res.ok) throw new Error("Failed to load spans");
        return (await res.json()) as TraceViewSpan[];
      })().catch(() => {
        spansPromise = null;
        return [];
      });
      return spansPromise;
    };

    const spanTypes = new Map<string, SpanType>();

    return {
      resolveSpanId: async (shortId) => {
        const suffix = shortId.toLowerCase();
        const span = (await loadSpans()).find((s) => s.spanId.toLowerCase().endsWith(suffix));
        if (!span) return null;
        spanTypes.set(span.spanId, span.spanType);
        return { uuid: span.spanId, type: span.spanType };
      },
      getSpanType: (uuid) => spanTypes.get(uuid),
      onSelectSpan: ({ traceId, spanId }) => {
        const targetTraceId = traceId ?? trace?.id;
        if (!targetTraceId) return;
        const params = new URLSearchParams({ traceId: targetTraceId, ...(spanId ? { spanId } : {}) });
        window.open(`/project/${projectId}/traces?${params}`, "_blank", "noopener,noreferrer");
      },
    };
  }, [projectId, trace]);
}
