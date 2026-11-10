import { parseAsString, useQueryStates } from "nuqs";
import { useCallback } from "react";

import { useTracePanelNavigate } from "@/components/traces/trace-view/trace-panel-url";

const openTraceParams = { traceId: parseAsString, spanId: parseAsString };

/** The turn whose trace panel is open; lives in the URL so it survives refresh, back, and sharing. */
export function useOpenTrace() {
  const [{ traceId, spanId }] = useQueryStates(openTraceParams);
  const navigate = useTracePanelNavigate();

  const closeTrace = useCallback(() => navigate({ type: "close" }), [navigate]);

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
