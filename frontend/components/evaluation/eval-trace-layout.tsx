"use client";

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const MIN_TABLE = 353; // magic number to match the width of buttons (add filter, columns, etc.) on the table header
const MIN_TRACE = 360;
const DEFAULT_TABLE = 420;
const GAP = 16; // seam between the table and trace column
const STORAGE_KEY = "evaluation-trace-table-width";

const clampTable = (w: number, maxWidth: number) =>
  Math.max(MIN_TABLE, Math.min(w, Math.max(MIN_TABLE, maxWidth - MIN_TRACE)));

const readStoredTableWidth = (): number => {
  if (typeof window === "undefined") return DEFAULT_TABLE;
  try {
    const parsed = parseInt(window.localStorage.getItem(STORAGE_KEY) ?? "", 10);
    return Number.isFinite(parsed) && parsed >= MIN_TABLE ? parsed : DEFAULT_TABLE;
  } catch {
    return DEFAULT_TABLE;
  }
};

interface EvalTraceLayoutProps {
  table: ReactNode;
  traceColumn: ReactNode;
}

// Static, resizable table | trace-column split. The trace panel is always open
// (auto-selected first datapoint), so there is no open/close animation.
export default function EvalTraceLayout({ table, traceColumn }: EvalTraceLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxWidth, setMaxWidth] = useState(0);
  const [tableWidth, setTableWidth] = useState(readStoredTableWidth);
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
  const clampedTable = clampTable(tableWidth, maxWidth);
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
      const onMove = (ev: PointerEvent) => {
        setTableWidth(clampTable(startWidth + (ev.clientX - startX), maxWidth));
      };
      const onUp = (ev: PointerEvent) => {
        setIsResizing(false);
        try {
          window.localStorage.setItem(
            STORAGE_KEY,
            String(Math.round(clampTable(startWidth + (ev.clientX - startX), maxWidth)))
          );
        } catch {
          // ignore
        }
        controller.abort();
        dragAbortRef.current = null;
      };
      handle.addEventListener("pointermove", onMove, { signal });
      handle.addEventListener("pointerup", onUp, { signal });
      handle.addEventListener("pointercancel", onUp, { signal });
    },
    [clampedTable, maxWidth]
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
