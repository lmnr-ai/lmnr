import { TraceViewSidePanel } from "@/components/traces/trace-view";

import { useOpenTrace } from "./use-open-trace";

// The thread always keeps this much width beside the trace panel.
const MIN_THREAD_WIDTH = 360;

/**
 * The opened turn's trace, laid out like the traces page's side panel (opening a span widens it, left edge
 * resizes) but beside the thread rather than over it, so the thread narrows to fit.
 */
export default function TracePanel() {
  const { openTraceId, openSpanId, closeTrace } = useOpenTrace();
  if (!openTraceId) return null;
  return (
    <TraceViewSidePanel
      inline
      reservedWidth={MIN_THREAD_WIDTH}
      traceId={openTraceId}
      spanId={openSpanId}
      // The open trace and span live in the URL here, so tabs and message links can too.
      urlState
      storeKey="chat-session-trace-view-state"
      onClose={closeTrace}
    />
  );
}
