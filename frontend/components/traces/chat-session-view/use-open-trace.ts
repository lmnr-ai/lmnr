import { parseAsString, useQueryStates } from "nuqs";
import { useCallback } from "react";

import { useSessionViewStore } from "@/components/traces/session-view/store";
import { useTracePanelNavigate } from "@/components/traces/trace-view/trace-panel-url";

const openTraceParams = { traceId: parseAsString, spanId: parseAsString };

/** The turn whose trace panel is open; lives in the URL so it survives refresh, back, and sharing. */
export function useOpenTrace() {
  const [{ traceId, spanId }] = useQueryStates(openTraceParams);
  const navigate = useTracePanelNavigate();
  const setTraceExpanded = useSessionViewStore((s) => s.setTraceExpanded);
  const setSelectedSpan = useSessionViewStore((s) => s.setSelectedSpan);

  const closeTrace = useCallback(() => {
    // Also collapse the trace's timeline segment and drop the timeline's span selection.
    if (traceId) setTraceExpanded(traceId, false);
    setSelectedSpan(undefined);
    navigate({ type: "close" });
  }, [traceId, setTraceExpanded, setSelectedSpan, navigate]);

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
