import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { TraceAgentContext } from "@/components/agent";
import TraceViewStoreProvider, {
  type ResizablePanel,
  type TraceViewTrace,
  useTraceViewStore,
} from "@/components/traces/trace-view/store";
import { ElevatedSurface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

import { STACK_THRESHOLD } from "./fill-width-layout";
import TraceViewContent from "./trace-view-content";
import { usePanelResize } from "./use-panel-resize";

interface TraceViewProps {
  traceId: string;
  spanId?: string;
  propsTrace?: TraceViewTrace;
  // Omit to hide the close button entirely (e.g. an always-open panel).
  onClose?: () => void;
  isFillWidth?: boolean;
  isAlwaysSelectSpan?: boolean;
  initialSignalId?: string;
  initialSearch?: string;
}

export default function TraceView(props: Omit<TraceViewProps, "isFillWidth">) {
  return (
    <TraceViewStoreProvider
      initialTrace={props.propsTrace}
      isAlwaysSelectSpan={props.isAlwaysSelectSpan}
      initialSignalId={props.initialSignalId}
      initialSearch={props.initialSearch}
    >
      <TraceAgentContext traceId={props.traceId} />
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
  // Below STACK_THRESHOLD the drawer covers the page and stacks like the mobile trace view.
  const [narrow, setNarrow] = useState(false);

  useLayoutEffect(() => {
    const el = sidePanelRef.current?.parentElement;
    if (!el) return;
    const measure = () => setNarrow(el.clientWidth < STACK_THRESHOLD);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // The side panel wraps its content in an ElevatedSurface but does NOT raise the level for
    // now (offset 0 → same level as the page it slides over); it's here as a ready knob to bump
    // the panel's elevation later. It still publishes the --surface* vars + context at this level.
    <ElevatedSurface
      ref={sidePanelRef}
      offset={0}
      className={cn(
        "absolute inset-y-0 right-0 z-50 flex",
        narrow ? "left-0" : "max-w-[calc(100%-80px)] border-l",
        className
      )}
    >
      <TraceViewStoreProvider
        key={props.traceId}
        initialTrace={props.propsTrace}
        isAlwaysSelectSpan={props.isAlwaysSelectSpan}
        initialSignalId={props.initialSignalId}
        initialSearch={props.initialSearch}
      >
        <div className="relative w-full h-full flex flex-col">
          <TraceAgentContext traceId={props.traceId} />
          {!narrow && <SidePanelLeftResizeHandle />}
          {/* w-0 min-w-full keeps children (e.g. the eval runs chart, which pins its own
                  measured pixel width via recharts) from driving the right-anchored side panel's
                  intrinsic width — otherwise the panel ratchets wider than trace+span and a gap
                  opens between the span view and the screen edge. */}
          {children && <div className="w-0 min-w-full">{children}</div>}
          <TraceViewContent {...props} sidePanelRef={narrow ? undefined : sidePanelRef} />
        </div>
      </TraceViewStoreProvider>
    </ElevatedSurface>
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
  const { resizePanel, spanPanelOpen } = useTraceViewStore(
    (s) => ({ resizePanel: s.resizePanel, spanPanelOpen: s.spanPanelOpen }),
    shallow
  );

  const visible = useMemo(() => ({ span: spanPanelOpen }), [spanPanelOpen]);

  const drag = useCallback(
    (panel: ResizablePanel, delta: number) => resizePanel(panel, delta, visible),
    [resizePanel, visible]
  );
  const { handlePointerDown } = usePanelResize("trace", drag);

  return (
    <div className="group absolute inset-y-0 left-0 z-[60] w-2 cursor-col-resize" onPointerDown={handlePointerDown}>
      <div className="absolute inset-y-0 left-0 w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-blue-400" />
    </div>
  );
}
