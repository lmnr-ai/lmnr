"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { SpanView, type SpanViewTab } from "@/components/traces/span-view";
import { SpanViewSkeleton } from "@/components/traces/span-view/skeleton";
import { LeftEdgeResizeHandle } from "@/components/traces/trace-view/left-edge-resize-handle";
import { usePanelResize } from "@/components/traces/trace-view/use-panel-resize";

import { useSessionViewBaseStore } from "./store";

const enterExitTransition = { duration: 0.25, ease: "easeOut" } as const;
const instantTransition = { duration: 0 } as const;

// Self-contained span panel: visibility (base `spanPanelOpen`), open/close
// animation, and resizability all live INSIDE this shared component — call
// sites just place it as the last child of a flex row (it participates in
// layout, pushing the main content over rather than overlaying it).
//
// Animation uses the dynamic-width-layout double-wrap pattern: the outer
// motion.div animates width with overflow-hidden while the inner absolute
// wrapper is pinned at the target width, so text never reflows mid-animation.
export default function SessionSpanPanel() {
  const { open, selection, width, resizePanel, setMaxWidth, setSpanPanelOpen } = useSessionViewBaseStore(
    (s) => ({
      open: s.spanPanelOpen,
      selection: s.selectedSpan,
      width: s.spanPanelWidth,
      resizePanel: s.resizePanel,
      setMaxWidth: s.setMaxWidth,
      setSpanPanelOpen: s.setSpanPanelOpen,
    }),
    shallow
  );

  // Keep rendering the last selection while the exit animation plays
  // (closing clears `selectedSpan` before AnimatePresence unmounts us). Compare by
  // VALUE (traceId+spanId): `selectedSpan` is a fresh object on every set, so a
  // reference compare fired a render-phase setState even when re-selecting the same
  // span (finding #7). Re-selecting the same span is a no-op here; the panel still
  // re-opens because `spanPanelOpen` flips independently in setSelectedSpan.
  const [lastSelection, setLastSelection] = useState(selection);
  if (selection && (selection.traceId !== lastSelection?.traceId || selection.spanId !== lastSelection?.spanId)) {
    setLastSelection(selection);
  }
  const shown = selection ?? lastSelection;

  const onResize = useCallback((_: unknown, delta: number) => resizePanel("span", delta), [resizePanel]);
  const { handleMouseDown, isResizing } = usePanelResize("span", onResize);

  // Clamp widths to the hosting flex row: observe the parent so store-side
  // fitPanelsToMaxWidth keeps `width` within the available space.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const parent = panelRef.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setMaxWidth(entry.contentRect.width);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [open, setMaxWidth]);

  const snippetTab: SpanViewTab = "span-input";

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="session-span-panel"
          ref={panelRef}
          className="relative h-full flex-shrink-0 overflow-hidden"
          initial={{ width: 0, opacity: 0.5 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 0, opacity: 0.5 }}
          transition={isResizing ? instantTransition : enterExitTransition}
        >
          {/* Inner wrapper pinned at target width — no text layout shift while
              the outer width animates. */}
          <div className="absolute inset-y-0 left-0 flex" style={{ width }}>
            <LeftEdgeResizeHandle onMouseDown={handleMouseDown} />
            <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
              {shown ? (
                <SpanView
                  key={shown.spanId}
                  spanId={shown.spanId}
                  traceId={shown.traceId}
                  initialTab={snippetTab}
                  onClose={() => setSpanPanelOpen(false)}
                />
              ) : (
                <SpanViewSkeleton />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
