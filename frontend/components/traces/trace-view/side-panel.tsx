import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { TraceAgentContext } from "@/components/agent";
import TraceViewStoreProvider, { type ResizablePanel, useTraceViewStore } from "@/components/traces/trace-view/store";
import { ElevatedSurface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

import { STACK_THRESHOLD } from "./fill-width-layout";
import TraceViewContent from "./trace-view-content";
import { type TraceViewLayout, type TraceViewProps } from "./trace-view-panels";
import { usePanelResize } from "./use-panel-resize";

export interface SidePanelProps extends Omit<TraceViewProps, "isFillWidth"> {
  className?: string;
  /** Sit beside the page in its flex row, which shrinks to fit, instead of floating over it. */
  inline?: boolean;
  /** Width the panel always leaves to the page beside it. */
  reservedWidth?: number;
}

/** One open drawer: measures the page it sits on and picks the layout. Presence is TraceViewSidePanel's. */
export default function SidePanel({ className, inline, reservedWidth = 80, ...props }: SidePanelProps) {
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState<number | null>(null);
  // Only the first trace slides in: switching traces remounts the content (keyed store) and mustn't replay it.
  const [shown, setShown] = useState({ traceId: props.traceId, first: true });
  if (shown.traceId !== props.traceId) setShown({ traceId: props.traceId, first: false });

  useLayoutEffect(() => {
    const el = sidePanelRef.current?.parentElement;
    if (!el) return;
    const measure = () => setPageWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Below STACK_THRESHOLD the drawer covers the page and stacks like the mobile trace view. Inline, the page
  // beside the panel keeps reservedWidth however narrow the row gets.
  const narrow = !inline && pageWidth !== null && pageWidth < STACK_THRESHOLD;
  // Stacking unmounts the dynamic layout; coming back wide must not replay the slide.
  if (narrow && shown.first) setShown({ ...shown, first: false });

  const layout: TraceViewLayout = narrow
    ? { type: "fill" }
    : { type: "dynamic", maxWidth: pageWidth === null ? Infinity : pageWidth - reservedWidth, slideIn: shown.first };

  return (
    // The side panel wraps its content in an ElevatedSurface but does NOT raise the level for
    // now (offset 0 → same level as the page it slides over); it's here as a ready knob to bump
    // the panel's elevation later. It still publishes the --surface* vars + context at this level.
    <ElevatedSurface
      ref={sidePanelRef}
      offset={0}
      className={cn(
        inline ? "relative flex h-full flex-shrink-0" : "absolute inset-y-0 right-0 z-50 flex",
        !inline && (narrow ? "left-0" : "max-w-[calc(100%-80px)]"),
        className
      )}
    >
      <TraceViewStoreProvider
        key={props.traceId}
        initialTrace={props.propsTrace}
        isAlwaysSelectSpan={props.isAlwaysSelectSpan}
        initialSignalId={props.initialSignalId}
        initialSearch={props.initialSearch}
        urlState={props.urlState}
        storeKey={props.storeKey}
      >
        <div className="relative w-full h-full flex flex-col">
          <TraceAgentContext traceId={props.traceId} />
          {!narrow && <SidePanelLeftResizeHandle />}
          <TraceViewContent {...props} layout={layout} />
        </div>
      </TraceViewStoreProvider>
    </ElevatedSurface>
  );
}

/**
 * Full-height resize handle pinned to the side panel's left edge, so the whole edge is grabbable.
 * Drives the trace panel resize; `visible` mirrors trace-view-content's panel-visibility derivation
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
