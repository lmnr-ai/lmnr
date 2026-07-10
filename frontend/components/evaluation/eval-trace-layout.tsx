"use client";

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";

const MIN_TABLE = 353; // magic number to match the width of buttons (add filter, columns, etc.) on the table header
const MIN_TRACE = 360;
const DEFAULT_TABLE = 420;
const GAP = 16; // seam between the table and trace column
const WIDTH_STORAGE_KEY = "evaluation-table-panel-width";

interface EvalTraceLayoutProps {
  table: ReactNode;
  traceColumn: ReactNode;
}

// Static, resizable table | trace-column split. The trace panel is always open
// (auto-selected first datapoint), so there is no open/close animation.
export default function EvalTraceLayout({ table, traceColumn }: EvalTraceLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxWidth, setMaxWidth] = useState(0);
  // Persisted user intent; live drag updates go through dragWidth and are
  // flushed to localStorage once on drag end. Deriving (instead of syncing via
  // an effect) applies the persisted width in the same render localStorage
  // hydrates, avoiding an extra painted frame at the default width.
  const [storedWidth, setStoredWidth] = useLocalStorage<number>(WIDTH_STORAGE_KEY, DEFAULT_TABLE);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const tableWidth = dragWidth ?? storedWidth;
  // Drives the seam highlight while dragging — hover alone can't cover it since
  // the pointer routinely outruns the 8px strip mid-drag.
  const [isResizing, setIsResizing] = useState(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setMaxWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Clamp so both panels keep their minimums as the viewport changes.
  const clampedTable = Math.max(MIN_TABLE, Math.min(tableWidth, Math.max(MIN_TABLE, maxWidth - MIN_TRACE)));
  const traceWidth = Math.max(0, maxWidth - clampedTable - GAP);

  // Tracks the in-flight drag's listeners so an unmount mid-drag can tear them down.
  const dragAbortRef = useRef<AbortController | null>(null);

  const startResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const handle = e.currentTarget;
      const startX = e.clientX;
      const startWidth = clampedTable;
      // Capture the pointer so move/up keep firing on the handle even when the
      // cursor crosses the trace column's iframe (custom renderer) — a plain
      // window listener would go silent over the iframe and freeze the drag.
      handle.setPointerCapture(e.pointerId);
      const controller = new AbortController();
      dragAbortRef.current = controller;
      const { signal } = controller;
      setIsResizing(true);
      let lastWidth = startWidth;
      const onMove = (ev: PointerEvent) => {
        const next = startWidth + (ev.clientX - startX);
        lastWidth = Math.max(MIN_TABLE, Math.min(next, Math.max(MIN_TABLE, maxWidth - MIN_TRACE)));
        setDragWidth(lastWidth);
      };
      const onUp = () => {
        setIsResizing(false);
        controller.abort();
        dragAbortRef.current = null;
        // Same batch: the storage write re-renders via useSyncExternalStore,
        // so clearing dragWidth never flashes a stale width.
        setStoredWidth(lastWidth);
        setDragWidth(null);
      };
      handle.addEventListener("pointermove", onMove, { signal });
      handle.addEventListener("pointerup", onUp, { signal });
      handle.addEventListener("pointercancel", onUp, { signal });
    },
    [clampedTable, maxWidth, setStoredWidth]
  );

  // Drop any listeners still attached if we unmount mid-drag.
  useEffect(() => () => dragAbortRef.current?.abort(), []);

  return (
    <div ref={containerRef} className="relative flex h-full w-full flex-1 overflow-hidden">
      <div className="h-full flex-shrink-0 overflow-hidden" style={{ width: clampedTable }}>
        {table}
      </div>

      <div className="h-full flex-shrink-0 overflow-hidden" style={{ width: traceWidth, marginLeft: GAP }}>
        {traceColumn}
      </div>

      {/* Resize strip straddling the trace column's LEFT BORDER (not the seam
          middle) so dragging reads as grabbing the trace view's edge. Invisible
          until hovered or dragged, when the centered line lights up over the
          border (same affordance as the trace view's LeftEdgeResizeHandle). */}
      {maxWidth > 0 && (
        <div
          onPointerDown={startResize}
          style={{ left: clampedTable + GAP }}
          className="group absolute inset-y-0 z-40 w-2 -translate-x-1/2 cursor-col-resize"
          role="separator"
          aria-orientation="vertical"
        >
          <div
            className={cn(
              "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors group-hover:bg-blue-400",
              isResizing && "bg-blue-400"
            )}
          />
        </div>
      )}
    </div>
  );
}
