import { useCallback, useEffect, useRef, useState } from "react";

import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { cn } from "@/lib/utils";

import { PANELS } from "./panel-layout";
import { type TraceViewPanels } from "./trace-view-panels";

const DEFAULT_TRACE_FRACTION = 0.6;
// Below this container width the span takes over the whole column (see `stacked`).
export const STACK_THRESHOLD = 760;

/**
 * Trace | span split for the always-open surfaces (eval / playground / dedicated trace page).
 *
 * One unified flex row: trace and span are always the same two flex siblings, so neither remounts
 * as the layout changes — the trace panel keeps its tree scroll / search state. A self-contained px
 * drag resizes the split (mirrors DynamicWidthLayout's manual pattern; no react-resizable-panels, so
 * there's no overlay / z-index stacking to bleed through). Below the combined pixel minimums the
 * trace collapses to width 0 (kept mounted, its content pinned to min-width so it doesn't reflow)
 * and the span takes the full column. On the dedicated page (`isAlwaysSelectSpan`) the span column
 * is otherwise permanent, so when stacked it only shows while a span is selected — closing it is
 * the way back to the tree (the close button surfaces via the `@container` query in SpanControls).
 */
export default function FillWidthLayout({ panels }: { panels: TraceViewPanels }) {
  // Drag-resize highlight (keeps working when the cursor crosses an iframe — dev #2031).
  const setIsResizing = useTraceViewStore((s) => s.setIsResizing);
  const isAlwaysSelectSpan = useTraceViewStore((s) => s.isAlwaysSelectSpan);
  const spanPanelOpen = useTraceViewStore((s) => s.spanPanelOpen);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // User's chosen trace width in px (null → the default fraction). Clamped to the pixel mins below.
  const [traceWidthPx, setTraceWidthPx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const measured = width > 0;
  const narrow = measured && width < STACK_THRESHOLD;
  const showSpan = panels.showSpan && !(narrow && isAlwaysSelectSpan && !spanPanelOpen);
  const stacked = showSpan && narrow;

  // Trace width: full when there's no span; 0 (collapsed, still mounted) when stacked; otherwise the
  // dragged width clamped so the span keeps its pixel minimum.
  const maxTrace = Math.max(PANELS.trace.min, width - PANELS.span.min);
  const desired = traceWidthPx ?? width * DEFAULT_TRACE_FRACTION;
  const traceWidth = !showSpan ? width : stacked ? 0 : Math.max(PANELS.trace.min, Math.min(desired, maxTrace));

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = traceWidth;
      setDragging(true);
      setIsResizing(true);
      const onMove = (ev: MouseEvent) => setTraceWidthPx(startWidth + (ev.clientX - startX));
      const onUp = () => {
        setDragging(false);
        setIsResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [traceWidth, setIsResizing]
  );

  const showHandle = showSpan && !stacked && measured;

  return (
    <div ref={containerRef} className="@container relative flex h-full w-full overflow-hidden">
      {/* Trace — always mounted. Inner pinned to min-width when collapsed so its content doesn't
          reflow to zero while the wrapper is clipped to 0. Before the first measurement (SSR) a
          flex-basis split stands in for the px width. Only the collapse to 0 is eased. */}
      <div
        className={cn(
          "h-full flex-shrink-0 overflow-hidden",
          measured ? "basis-auto" : showSpan ? "basis-full md:basis-[60%]" : "basis-full",
          traceWidth === 0 ? "transition-[width] duration-200 ease-out" : "transition-none"
        )}
        style={{ width: measured ? traceWidth : undefined }}
      >
        <div className="h-full" style={{ width: stacked ? PANELS.trace.min : "100%" }}>
          {panels.tracePanel}
        </div>
      </div>

      {/* Span — flexes to fill whatever the trace leaves (the whole column when stacked). */}
      {showSpan && (
        <div className={cn("h-full min-w-0 flex-1 overflow-hidden", !measured && "hidden md:block")}>
          {panels.spanPanel}
        </div>
      )}

      {/* Resize strip over the trace/span boundary. */}
      {showHandle && (
        <div
          onMouseDown={startResize}
          style={{ left: traceWidth }}
          className="group absolute inset-y-0 z-10 w-2 -translate-x-1/2 cursor-col-resize"
          role="separator"
          aria-orientation="vertical"
        >
          <div
            className={cn(
              "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:w-0.5 group-hover:bg-blue-400",
              dragging && "w-0.5 bg-blue-400"
            )}
          />
        </div>
      )}
    </div>
  );
}
