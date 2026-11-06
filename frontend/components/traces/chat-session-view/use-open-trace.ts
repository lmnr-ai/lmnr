import { parseAsString, useQueryStates } from "nuqs";
import { useCallback } from "react";

import { useSessionViewStore } from "@/components/traces/session-view/store";
import { SPAN_TAB_PARAM } from "@/components/traces/span-view/use-span-view-tab";
import { TRACE_VIEW_PARAM } from "@/components/traces/trace-view/use-trace-view-tab";

// The view params ride along so a closed panel doesn't leave its tabs behind in the URL.
const openTraceParams = {
  traceId: parseAsString,
  spanId: parseAsString,
  [TRACE_VIEW_PARAM]: parseAsString,
  [SPAN_TAB_PARAM]: parseAsString,
};

/** The turn whose trace panel is open; lives in the URL so it survives refresh, back, and sharing. */
export function useOpenTrace() {
  const [{ traceId, spanId }, setParams] = useQueryStates(openTraceParams, { history: "push" });
  const setTraceExpanded = useSessionViewStore((s) => s.setTraceExpanded);
  const setSelectedSpan = useSessionViewStore((s) => s.setSelectedSpan);

  const closeTrace = useCallback(() => {
    // Also collapse the trace's timeline segment and drop the timeline's span selection.
    if (traceId) setTraceExpanded(traceId, false);
    setSelectedSpan(undefined);
    void setParams({ traceId: null, spanId: null, [TRACE_VIEW_PARAM]: null, [SPAN_TAB_PARAM]: null });
  }, [traceId, setTraceExpanded, setSelectedSpan, setParams]);

  const toggleTrace = useCallback(
    (id: string) => (id === traceId ? closeTrace() : void setParams({ traceId: id, spanId: null })),
    [traceId, closeTrace, setParams]
  );

  const openSpan = useCallback(
    (nextTraceId: string, nextSpanId: string) => void setParams({ traceId: nextTraceId, spanId: nextSpanId }),
    [setParams]
  );

  return { openTraceId: traceId ?? undefined, openSpanId: spanId ?? undefined, toggleTrace, openSpan, closeTrace };
}
