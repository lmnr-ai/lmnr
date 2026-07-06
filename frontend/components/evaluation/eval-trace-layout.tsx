"use client";

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const MIN_TABLE = 320;
const MIN_TRACE = 360;
const DEFAULT_TABLE = 420;
const GAP = 8; // seam between the table and trace column

interface EvalTraceLayoutProps {
  table: ReactNode;
  traceColumn: ReactNode;
}

// Static, resizable table | trace-column split. The trace panel is always open
// (auto-selected first datapoint), so there is no open/close animation.
export default function EvalTraceLayout({ table, traceColumn }: EvalTraceLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxWidth, setMaxWidth] = useState(0);
  const [tableWidth, setTableWidth] = useState(DEFAULT_TABLE);

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
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = clampedTable;
      const controller = new AbortController();
      dragAbortRef.current = controller;
      const { signal } = controller;
      const onMove = (ev: MouseEvent) => {
        const next = startWidth + (ev.clientX - startX);
        setTableWidth(Math.max(MIN_TABLE, Math.min(next, Math.max(MIN_TABLE, maxWidth - MIN_TRACE))));
      };
      const onUp = () => {
        controller.abort();
        dragAbortRef.current = null;
      };
      window.addEventListener("mousemove", onMove, { signal });
      window.addEventListener("mouseup", onUp, { signal });
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

      {/* Invisible resize strip straddling the table|trace seam. */}
      {maxWidth > 0 && (
        <div
          onMouseDown={startResize}
          style={{ left: clampedTable + GAP / 2 }}
          className="absolute inset-y-0 z-40 w-2 -translate-x-1/2 cursor-col-resize"
          role="separator"
          aria-orientation="vertical"
        />
      )}
    </div>
  );
}
