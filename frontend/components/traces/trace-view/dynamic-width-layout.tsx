import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { shallow } from "zustand/shallow";

import { LeftEdgeResizeHandle } from "@/components/traces/trace-view/left-edge-resize-handle";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { usePanelResize } from "@/components/traces/trace-view/use-panel-resize";

import { type TraceViewPanels } from "./trace-view-content";

const enterExitTransition = { type: "spring", stiffness: 300, damping: 30 } as const;
const instantTransition = { duration: 0 } as const;

export default function DynamicWidthLayout({ panels }: { panels: TraceViewPanels }) {
  const { tracePanelWidth, spanPanelWidth, chatPanelWidth, resizePanel, setMaxWidth } = useTraceViewStore(
    (state) => ({
      tracePanelWidth: state.tracePanelWidth,
      spanPanelWidth: state.spanPanelWidth,
      chatPanelWidth: state.chatPanelWidth,
      resizePanel: state.resizePanel,
      setMaxWidth: state.setMaxWidth,
    }),
    shallow
  );

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const sidePanel = el.closest("[class*='absolute']");
    const measured = (sidePanel?.parentElement as HTMLElement) ?? el;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setMaxWidth(entry.contentRect.width - 80);
      }
    });
    observer.observe(measured);
    return () => observer.disconnect();
  }, [setMaxWidth]);

  const traceResize = usePanelResize("trace", resizePanel);
  const spanResize = usePanelResize("span", resizePanel);
  const chatResize = usePanelResize("chat", resizePanel);

  const isResizing = traceResize.isResizing || spanResize.isResizing || chatResize.isResizing;
  const transition = isResizing ? instantTransition : enterExitTransition;

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden">
      <div className="flex flex-row h-full">
        {/* Trace Panel — always visible */}
        <div className="relative flex h-full flex-shrink-0" style={{ width: tracePanelWidth }}>
          <LeftEdgeResizeHandle onMouseDown={traceResize.handleMouseDown} />
          {panels.tracePanel}
        </div>

        <AnimatePresence initial={false}>
          {/* Span Panel */}
          {panels.showSpan && (
            <motion.div
              key="span-panel"
              className="relative h-full flex-shrink-0 overflow-hidden"
              initial={{ width: 0, opacity: 0.5 }}
              animate={{ width: spanPanelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0.5 }}
              transition={transition}
            >
              <div className="absolute inset-y-0 left-0 flex" style={{ width: spanPanelWidth }}>
                <LeftEdgeResizeHandle onMouseDown={spanResize.handleMouseDown} />
                {panels.spanPanel}
              </div>
            </motion.div>
          )}

          {/* Chat Panel */}
          {panels.showChat && panels.chatPanel && (
            <motion.div
              key="chat-panel"
              className="relative h-full flex-shrink-0 overflow-hidden"
              initial={{ width: 0, opacity: 0.5 }}
              animate={{ width: chatPanelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0.5 }}
              transition={transition}
            >
              <div className="absolute inset-y-0 left-0 flex" style={{ width: chatPanelWidth }}>
                <LeftEdgeResizeHandle onMouseDown={chatResize.handleMouseDown} />
                {panels.chatPanel}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
