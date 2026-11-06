import { parseAsString, useQueryStates } from "nuqs";
import { useCallback } from "react";

import { useSessionViewStore } from "@/components/traces/session-view/store";

const openTraceParams = { traceId: parseAsString, spanId: parseAsString };

/** The turn whose trace panel is open; lives in the URL so it survives refresh, back, and sharing. */
export function useOpenTrace() {
  const [{ traceId, spanId }, setParams] = useQueryStates(openTraceParams, { history: "push" });
  const setTraceExpanded = useSessionViewStore((s) => s.setTraceExpanded);
  const setSelectedSpan = useSessionViewStore((s) => s.setSelectedSpan);

  const closeTrace = useCallback(() => {
    // Also collapse the trace's timeline segment and drop the timeline's span selection.
    if (traceId) setTraceExpanded(traceId, false);
    setSelectedSpan(undefined);
    void setParams({ traceId: null, spanId: null });
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
