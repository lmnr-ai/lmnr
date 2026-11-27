import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
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
  /** The side panel's width budget, from its page's width. */
  maxWidth: number;
  /** Slide the trace in from zero width on mount (the panel opening, not a trace switch inside it). */
  slideIn: boolean;
}

export default function DynamicWidthLayout({ panels, maxWidth: budget, slideIn }: DynamicWidthLayoutProps) {
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

  // The store keeps the budget too, so drags clamp to it and resizes from it skip the animation. A layout
  // effect, so the store catches up before paint and no frame lays out against a stale budget.
  useLayoutEffect(() => setMaxWidth(budget), [budget, setMaxWidth]);

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

  // While the trace slides in or out (under a parent AnimatePresence), its content stays pinned at full width so
  // text doesn't reflow; otherwise it flows with the column, which keeps resizes and span toggles gap-free.
  const [sliding, setSliding] = useState(slideIn);
  const isPresent = useIsPresent();
  const pinned = sliding || !isPresent;

  return (
    <div className="h-full w-full overflow-hidden">
      <div className="flex flex-row h-full">
        <motion.div
          className="relative flex h-full flex-shrink-0 overflow-hidden"
          initial={sliding ? { width: 0, opacity: 0.5 } : false}
          animate={{ width: widths.trace, opacity: 1 }}
          exit={{ width: 0, opacity: 0.5, transition: enterExitTransition }}
          transition={sliding ? enterExitTransition : transition}
          onAnimationComplete={() => setSliding(false)}
        >
          <div
            className={pinned ? "absolute inset-y-0 left-0 flex" : "flex h-full w-full"}
            style={pinned ? { width: widths.trace } : undefined}
          >
            {panels.tracePanel}
          </div>
        </motion.div>

        {/* Not `propagate`: framer-motion renders a propagated child twice when its parent re-renders mid-exit (a
            second span panel mounts while the drawer closes). The span slides out with the trace via `animate`. */}
        <AnimatePresence initial={false}>
          {/* Span Panel */}
          {panels.showSpan && (
            <motion.div
              key="span-panel"
              className="relative h-full flex-shrink-0 overflow-hidden"
              initial={{ width: 0, opacity: 0.5 }}
              animate={isPresent ? { width: widths.span, opacity: 1 } : { width: 0, opacity: 0.5 }}
              exit={{ width: 0, opacity: 0.5 }}
              transition={isPresent ? transition : enterExitTransition}
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
