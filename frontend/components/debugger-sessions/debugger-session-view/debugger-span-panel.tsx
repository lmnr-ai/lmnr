"use client";

import { SpanView, type SpanViewTab } from "@/components/traces/span-view";

interface DebuggerSpanPanelProps {
  traceId: string;
  spanId: string;
  onClose: () => void;
}

/**
 * Right-side SPAN overlay for the debugger view. Mirrors the regular session
 * view's span-click behavior (SessionSpanPanel → <SpanView>) but positioned as an
 * absolute overlay matching TraceViewSidePanel's anchoring — NOT a resizable
 * shell. Span clicks open this; the trace-card dropdown's "Open trace view" opens
 * the full TraceViewSidePanel instead.
 */
export default function DebuggerSpanPanel({ traceId, spanId, onClose }: DebuggerSpanPanelProps) {
  const initialTab: SpanViewTab = "span-input";

  return (
    // Same anchoring as TraceViewSidePanel: absolute right overlay covering the
    // breadcrumb row, above the article content.
    <div className="absolute top-0 right-0 bottom-0 max-w-[calc(100%-80px)] w-[600px] bg-background border-l z-50 flex">
      <div className="flex flex-col h-full w-full overflow-hidden flex-1">
        <SpanView key={spanId} spanId={spanId} traceId={traceId} initialTab={initialTab} onClose={onClose} />
      </div>
    </div>
  );
}
