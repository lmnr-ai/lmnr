"use client";

import { useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { shallow } from "zustand/shallow";

import { SpanView } from "@/components/shared/traces/span-view";
import TracePanel from "@/components/shared/traces/trace-panel";
import { SpanViewSkeleton } from "@/components/traces/span-view/skeleton";
import FillWidthLayout, { STACK_THRESHOLD } from "@/components/traces/trace-view/fill-width-layout";
import TraceViewStoreProvider, {
  type TraceViewSpan,
  type TraceViewTrace,
  useTraceViewStore,
} from "@/components/traces/trace-view/store";
import { navigateTracePanel } from "@/components/traces/trace-view/trace-panel-url";
import { useTraceSignals } from "@/components/traces/trace-view/use-trace-signals";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";

interface TraceViewProps {
  trace: TraceViewTrace;
  spans: TraceViewSpan[];
  onClose?: () => void;
}

// Expects a store seeded with `trace`/`spans` so the server render already shows the tree.
export const PureTraceView = ({ trace, spans, onClose }: TraceViewProps) => {
  const searchParams = useSearchParams();

  const { selectedSpan, setSelectedSpan, spanPanelOpen } = useTraceViewStore(
    (state) => ({
      selectedSpan: state.selectedSpan,
      setSelectedSpan: state.setSelectedSpan,
      spanPanelOpen: state.spanPanelOpen,
    }),
    shallow
  );

  // Auto-selecting the first span needs the viewport width; keep a span placeholder until the effect decides.
  const [selectionPending, setSelectionPending] = useState(!onClose);

  useTraceSignals(`/api/shared/traces/${trace.id}/signals`);

  const handleSpanSelect = useCallback(
    (span?: TraceViewSpan) => {
      if (span) navigateTracePanel({ type: "selectSpan", spanId: span.spanId });
      setSelectedSpan(span);
    },
    [setSelectedSpan]
  );

  const handleSpanPanelClose = useCallback(() => {
    setSelectedSpan(undefined);
    navigateTracePanel({ type: "closeSpan" });
  }, [setSelectedSpan]);

  useEffect(() => {
    const spanId = searchParams.get("spanId");
    const linkedSpan = spanId ? spans.find((s) => s.spanId === spanId) : undefined;
    const span = linkedSpan ?? (!onClose && window.innerWidth >= STACK_THRESHOLD ? spans[0] : undefined);
    if (span) {
      setSelectedSpan({ ...span, collapsed: false });
    }
    setSelectionPending(false);
  }, []);

  const panels = {
    tracePanel: <TracePanel trace={trace} spans={spans} onClose={onClose} onSpanSelect={handleSpanSelect} />,
    spanPanel: selectedSpan ? (
      <SpanView
        key={selectedSpan.spanId}
        spanId={selectedSpan.spanId}
        traceId={trace.id}
        onClose={handleSpanPanelClose}
      />
    ) : (
      <SpanViewSkeleton />
    ),
    showSpan: spanPanelOpen || selectionPending,
  };

  return (
    // isolate: inner z-indexed handles must not cover the header's mobile menu overlay.
    <div className="flex h-full w-full min-h-0 overflow-hidden isolate">
      <FillWidthLayout panels={panels} />
    </div>
  );
};

export default function TraceView(props: TraceViewProps) {
  return (
    <TraceViewStoreProvider
      urlState
      storeKey="shared-trace-view"
      initialTrace={props.trace}
      initialSpans={enrichSpansWithPending(props.spans)}
    >
      <PureTraceView {...props} />
    </TraceViewStoreProvider>
  );
}
