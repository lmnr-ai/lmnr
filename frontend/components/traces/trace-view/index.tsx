import React, { useCallback, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import TraceViewStoreProvider, {
  type ResizablePanel,
  type TraceViewTrace,
  useTraceViewStore,
} from "@/components/traces/trace-view/store";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { Feature } from "@/lib/features/features";
import { cn } from "@/lib/utils";

import TraceViewContent from "./trace-view-content";
import { usePanelResize } from "./use-panel-resize";

interface TraceViewProps {
  traceId: string;
  spanId?: string;
  propsTrace?: TraceViewTrace;
  onClose: () => void;
  isFillWidth?: boolean;
  isAlwaysSelectSpan?: boolean;
  initialSignalId?: string;
  showChatInitial?: boolean;
  initialSearch?: string;
}

export default function TraceView(props: Omit<TraceViewProps, "isFillWidth">) {
  return (
    <TraceViewStoreProvider
      initialTrace={props.propsTrace}
      isAlwaysSelectSpan={props.isAlwaysSelectSpan}
      initialSignalId={props.initialSignalId}
      initialChatOpen={props.showChatInitial}
      initialSearch={props.initialSearch}
    >
      <TraceViewContent {...props} />
    </TraceViewStoreProvider>
  );
}

export function TraceViewSidePanel({
  className,
  children,
  ...props
}: Omit<TraceViewProps, "isFillWidth"> & { className?: string; children?: React.ReactNode }) {
  const sidePanelRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={sidePanelRef}
      className={cn(
        "absolute top-0 right-0 bottom-0 max-w-[calc(100%-80px)] bg-background border-l z-50 flex",
        className
      )}
    >
      <TraceViewStoreProvider
        key={props.traceId}
        initialTrace={props.propsTrace}
        isAlwaysSelectSpan={props.isAlwaysSelectSpan}
        initialSignalId={props.initialSignalId}
        initialChatOpen={props.showChatInitial}
        initialSearch={props.initialSearch}
      >
        <div className="relative w-full h-full flex flex-col">
          <SidePanelLeftResizeHandle />
          {children}
          <TraceViewContent {...props} sidePanelRef={sidePanelRef} />
        </div>
      </TraceViewStoreProvider>
    </div>
  );
}

/**
 * Full-height resize handle pinned to the side panel's left edge. Lives here (not in
 * DynamicWidthLayout) so the entire left edge is grabbable — including the header area
 * above the trace panel where children (e.g. the eval runs chart) render. Drives the
 * trace panel resize; `visible` mirrors trace-view-content's panel-visibility derivation
 * so the resize math matches what's rendered.
 */
function SidePanelLeftResizeHandle() {
  const { resizePanel, spanPanelOpen, tracesAgentOpen, isAlwaysSelectSpan, isTraceLoading, hasTrace, spansLength } =
    useTraceViewStore(
      (s) => ({
        resizePanel: s.resizePanel,
        spanPanelOpen: s.spanPanelOpen,
        tracesAgentOpen: s.tracesAgentOpen,
        isAlwaysSelectSpan: s.isAlwaysSelectSpan,
        isTraceLoading: s.isTraceLoading,
        hasTrace: !!s.trace,
        spansLength: s.spans.length,
      }),
      shallow
    );

  const isChatEnabled = useFeatureFlags()[Feature.AGENT];
  const isLoading = isTraceLoading && !hasTrace;
  const showSpan = spanPanelOpen || (isAlwaysSelectSpan && !isLoading && spansLength > 0);
  const showChat = isChatEnabled && tracesAgentOpen;
  const visible = useMemo(() => ({ span: showSpan, chat: showChat }), [showSpan, showChat]);

  const drag = useCallback(
    (panel: ResizablePanel, delta: number) => resizePanel(panel, delta, visible),
    [resizePanel, visible]
  );
  const { handleMouseDown } = usePanelResize("trace", drag);

  return (
    <div className="group absolute inset-y-0 left-0 z-[60] w-2 cursor-col-resize" onMouseDown={handleMouseDown}>
      <div className="absolute inset-y-0 left-0 w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-blue-400" />
    </div>
  );
}
