import { useEffect, useRef } from "react";
import { shallow } from "zustand/shallow";

import { LeftEdgeResizeHandle } from "@/components/traces/trace-view/left-edge-resize-handle";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { usePanelResize } from "@/components/traces/trace-view/use-panel-resize";

import { type TraceViewPanels } from "./trace-view-content";

export default function FixedWidthLayout({ panels }: { panels: TraceViewPanels }) {
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

  // Observe the containing block that the SidePanel is positioned within.
  // The SidePanel is position:absolute, so we need its offsetParent — the
  // nearest positioned ancestor (the page's main content area). This gives
  // a stable width that doesn't shrink when panel content shrinks.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Walk up past our container and the SidePanel to find the element
    // that provides the positioning context (offsetParent of the SidePanel).
    const sidePanel = el.closest("[class*='absolute']");
    const measured = (sidePanel?.parentElement as HTMLElement) ?? el;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setMaxWidth(entry.contentRect.width - 40);
      }
    });
    observer.observe(measured);
    return () => observer.disconnect();
  }, [setMaxWidth]);

  const traceResize = usePanelResize("trace", resizePanel);
  const spanResize = usePanelResize("span", resizePanel);
  const chatResize = usePanelResize("chat", resizePanel);

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden">
      <div className="flex flex-row h-full">
        {/* Trace Panel — always visible */}
        <div className="relative flex h-full flex-shrink-0" style={{ width: tracePanelWidth }}>
          <LeftEdgeResizeHandle onMouseDown={traceResize.handleMouseDown} />
          {panels.tracePanel}
        </div>

        {/* Span Panel */}
        {panels.showSpan && (
          <div className="relative flex h-full flex-shrink-0" style={{ width: spanPanelWidth }}>
            <LeftEdgeResizeHandle onMouseDown={spanResize.handleMouseDown} />
            {panels.spanPanel}
          </div>
        )}

        {/* Chat Panel */}
        {panels.showChat && panels.chatPanel && (
          <div className="relative flex h-full flex-shrink-0" style={{ width: chatPanelWidth }}>
            <LeftEdgeResizeHandle onMouseDown={chatResize.handleMouseDown} />
            {panels.chatPanel}
          </div>
        )}
      </div>
    </div>
  );
}
