import { parseAsString, useQueryStates } from "nuqs";
import { useCallback } from "react";

import { navigateTracePanel } from "@/components/traces/trace-view/trace-panel-url";

const openTraceParams = { traceId: parseAsString, spanId: parseAsString };

/** The turn whose trace panel is open; lives in the URL so it survives refresh, back, and sharing. */
export function useOpenTrace() {
  const [{ traceId, spanId }] = useQueryStates(openTraceParams);

  const closeTrace = useCallback(() => navigateTracePanel({ type: "close" }), []);

  const toggleTrace = useCallback(
    (id: string) => (id === traceId ? closeTrace() : navigateTracePanel({ type: "open", traceId: id })),
    [traceId, closeTrace]
  );

  const openSpan = useCallback(
    (nextTraceId: string, nextSpanId: string) =>
      navigateTracePanel({ type: "open", traceId: nextTraceId, spanId: nextSpanId }),
    []
  );

  return { openTraceId: traceId ?? undefined, openSpanId: spanId ?? undefined, toggleTrace, openSpan, closeTrace };
}
