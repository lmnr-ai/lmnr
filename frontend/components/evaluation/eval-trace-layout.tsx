"use client";

import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const MIN_TABLE = 320;
const MIN_TRACE = 360;
const DEFAULT_TABLE = 420;
const GAP = 8; // seam between the table and trace column
const enterExit = { duration: 0.25, ease: "easeOut" } as const;
const instant = { duration: 0 } as const;

interface EvalTraceLayoutProps {
  table: ReactNode;
  traceColumn: ReactNode;
  showTrace: boolean;
}

/**
 * Animated table | trace-column split. Mirrors trace-view's
 * dynamic-width-layout wrapper trick: each panel's OUTER motion.div animates
 * `width` (clipping via overflow-hidden) while the INNER content is pinned at a
 * fixed px width in an absolute layer, so content never tweens its own width —
 * it reflows once at the target and the container reveals/hides it. The trace
 * column slides in from the right on open; the table stays mounted across the
 * transition (no remount / refetch). Resize is an invisible col-resize strip at
 * the boundary.
 */
export default function EvalTraceLayout({ table, traceColumn, showTrace }: EvalTraceLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxWidth, setMaxWidth] = useState(0);
  const [tableWidth, setTableWidth] = useState(DEFAULT_TABLE);
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
  const transition = isResizing ? instant : enterExit;

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = clampedTable;
      setIsResizing(true);
      const onMove = (ev: MouseEvent) => {
        const next = startWidth + (ev.clientX - startX);
        setTableWidth(Math.max(MIN_TABLE, Math.min(next, Math.max(MIN_TABLE, maxWidth - MIN_TRACE))));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setIsResizing(false);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [clampedTable, maxWidth]
  );

  return (
    <div ref={containerRef} className="relative flex h-full w-full flex-1 overflow-hidden">
      {/* Table — width flips between full (no trace) and clampedTable; inner is
          pinned at the target so the reflow is instant, not tweened. */}
      <motion.div
        className="relative h-full flex-shrink-0 overflow-hidden"
        // Hard floor so the table can never be dragged to nothing, independent
        // of the width math (matches fill-width-layout's minSize guarantee).
        style={{ minWidth: showTrace ? MIN_TABLE : undefined }}
        initial={false}
        animate={{ width: showTrace ? clampedTable : maxWidth }}
        transition={transition}
      >
        <div
          // Right padding only when the table owns the full row — with a trace
          // open the seam handles the gap and the table is flush on the right.
          className={cn("absolute inset-y-0 left-0 flex overflow-hidden", !showTrace && "pr-4")}
          style={{ width: showTrace ? clampedTable : maxWidth }}
        >
          {table}
        </div>
      </motion.div>

      <AnimatePresence initial={false}>
        {showTrace && maxWidth > 0 && (
          <motion.div
            key="trace-col"
            className="relative h-full flex-shrink-0 overflow-hidden"
            style={{ marginLeft: GAP }}
            initial={{ width: 0 }}
            animate={{ width: traceWidth }}
            exit={{ width: 0 }}
            transition={transition}
          >
            <div className="absolute inset-y-0 left-0 h-full" style={{ width: traceWidth }}>
              {traceColumn}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invisible resize strip at the table|trace boundary. Lives in the
          un-clipped root (a strip inside the overflow-hidden trace column would
          be clipped) and straddles the seam. */}
      {showTrace && maxWidth > 0 && (
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
