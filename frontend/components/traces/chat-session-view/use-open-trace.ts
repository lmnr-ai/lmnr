import { parseAsString, useQueryStates } from "nuqs";
import { useCallback } from "react";

import { useTracePanelNavigate } from "@/components/traces/trace-view/trace-panel-url";

import { useChatSession } from "./store";

const openTraceParams = { traceId: parseAsString, spanId: parseAsString };

/** The turn whose trace panel is open; lives in the URL so it survives refresh, back, and sharing. */
export function useOpenTrace() {
  const [{ traceId, spanId }] = useQueryStates(openTraceParams);
  const navigate = useTracePanelNavigate();
  const setTraceExpanded = useChatSession((s) => s.setTraceExpanded);

  const closeTrace = useCallback(() => {
    // Also collapse the trace's timeline segment.
    if (traceId) setTraceExpanded(traceId, false);
    navigate({ type: "close" });
  }, [traceId, setTraceExpanded, navigate]);

  const toggleTrace = useCallback(
    (id: string) => (id === traceId ? closeTrace() : navigate({ type: "open", traceId: id })),
    [traceId, closeTrace, navigate]
  );

  const openSpan = useCallback(
    (nextTraceId: string, nextSpanId: string) => navigate({ type: "open", traceId: nextTraceId, spanId: nextSpanId }),
    [navigate]
  );

  return { openTraceId: traceId ?? undefined, openSpanId: spanId ?? undefined, toggleTrace, openSpan, closeTrace };
}
