"use client";

import { shallow } from "zustand/shallow";

import { SpanView } from "@/components/shared/traces/span-view";
import TracePanel from "@/components/shared/traces/trace-panel";
import { SpanViewSkeleton } from "@/components/traces/span-view/skeleton";
import FillWidthLayout from "@/components/traces/trace-view/fill-width-layout";
import TraceViewStoreProvider, {
  type TraceViewSpan,
  type TraceViewTrace,
  useTraceViewStore,
} from "@/components/traces/trace-view/store";
import { enrichSpansWithPending } from "@/components/traces/trace-view/utils";

interface EmbeddedTraceViewProps {
  trace: TraceViewTrace;
  spans: TraceViewSpan[];
}

// Shared trace view for inline embeds: leaves the host URL alone, skips signal events, opens on the tree.
function PureEmbeddedTraceView({ trace, spans }: EmbeddedTraceViewProps) {
  const { selectedSpan, setSelectedSpan, spanPanelOpen } = useTraceViewStore(
    (state) => ({
      selectedSpan: state.selectedSpan,
      setSelectedSpan: state.setSelectedSpan,
      spanPanelOpen: state.spanPanelOpen,
    }),
    shallow
  );

  const panels = {
    tracePanel: <TracePanel trace={trace} spans={spans} onSpanSelect={setSelectedSpan} />,
    spanPanel: selectedSpan ? (
      <SpanView
        key={selectedSpan.spanId}
        spanId={selectedSpan.spanId}
        traceId={trace.id}
        onClose={() => setSelectedSpan(undefined)}
      />
    ) : (
      <SpanViewSkeleton />
    ),
    showSpan: spanPanelOpen,
  };

  return (
    <div className="flex h-full w-full min-h-0 overflow-hidden isolate">
      <FillWidthLayout panels={panels} />
    </div>
  );
}

export default function EmbeddedTraceView(props: EmbeddedTraceViewProps) {
  return (
    <TraceViewStoreProvider
      storeKey="shared-trace-view"
      initialTrace={props.trace}
      initialSpans={enrichSpansWithPending(props.spans)}
    >
      <PureEmbeddedTraceView {...props} />
    </TraceViewStoreProvider>
  );
}
