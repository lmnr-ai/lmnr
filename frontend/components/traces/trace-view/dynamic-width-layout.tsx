import { AnimatePresence, motion } from "framer-motion";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { LeftEdgeResizeHandle } from "@/components/traces/trace-view/left-edge-resize-handle";
import { computeLayout, type ResizablePanel, type Visible } from "@/components/traces/trace-view/panel-layout";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { usePanelResize } from "@/components/traces/trace-view/use-panel-resize";

import { type TraceViewPanels } from "./trace-view-panels";

const enterExitTransition = { duration: 0.25, ease: "easeOut" } as const;
const instantTransition = { duration: 0 } as const;

interface DynamicWidthLayoutProps {
  panels: TraceViewPanels;
  sidePanelRef?: React.RefObject<HTMLDivElement | null>;
}

export default function DynamicWidthLayout({ panels, sidePanelRef }: DynamicWidthLayoutProps) {
  const { targets, maxWidth, layoutChangeSource, resizePanel, setMaxWidth } = useTraceViewStore(
    (state) => ({
      targets: state.targets,
      maxWidth: state.maxWidth,
      layoutChangeSource: state.layoutChangeSource,
      resizePanel: state.resizePanel,
      setMaxWidth: state.setMaxWidth,
    }),
    shallow
  );

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measured = sidePanelRef?.current?.parentElement ?? containerRef.current;
    if (!measured) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setMaxWidth(entry.contentRect.width - 80);
      }
    });
    observer.observe(measured);
    return () => observer.disconnect();
  }, [sidePanelRef, setMaxWidth]);

  const visible = useMemo<Visible>(() => ({ span: panels.showSpan }), [panels.showSpan]);

  const widths = useMemo(() => computeLayout(targets, visible, maxWidth), [targets, visible, maxWidth]);

  const dragPanel = useCallback(
    (panel: ResizablePanel, delta: number) => resizePanel(panel, delta, visible),
    [resizePanel, visible]
  );

  // Trace's left-edge handle lives at the side-panel level (TraceViewSidePanel) so it
  // spans the full height including the header/chart area above this layout.
  const spanResize = usePanelResize("span", dragPanel);

  const isResizing = spanResize.isResizing;
  const transition = !isResizing && layoutChangeSource === "visibility" ? enterExitTransition : instantTransition;

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden">
      <div className="flex flex-row h-full">
        {/* Trace has no inner-abs wrapper because it never animates from 0 — content reflows
            with the flex item. Span/chat keep the inner-abs pinned-at-target slide-in pattern. */}
        <motion.div
          className="relative flex h-full flex-shrink-0"
          initial={false}
          animate={{ width: widths.trace }}
          transition={transition}
        >
          {panels.tracePanel}
        </motion.div>

        <AnimatePresence initial={false}>
          {/* Span Panel */}
          {panels.showSpan && (
            <motion.div
              key="span-panel"
              className="relative h-full flex-shrink-0 overflow-hidden"
              initial={{ width: 0, opacity: 0.5 }}
              animate={{ width: widths.span, opacity: 1 }}
              exit={{ width: 0, opacity: 0.5 }}
              transition={transition}
            >
              <div className="absolute inset-y-0 left-0 flex" style={{ width: widths.span }}>
                <LeftEdgeResizeHandle onPointerDown={spanResize.handlePointerDown} />
                {panels.spanPanel}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
