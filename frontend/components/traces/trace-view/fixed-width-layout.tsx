import { shallow } from "zustand/shallow";

import { LeftEdgeResizeHandle } from "@/components/traces/trace-view/left-edge-resize-handle";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { usePanelResize } from "@/components/traces/trace-view/use-panel-resize";

import { type TraceViewPanels } from "./trace-view-content";

export default function FixedWidthLayout({ panels }: { panels: TraceViewPanels }) {
  const { tracePanelWidth, spanPanelWidth, signalPanelWidth, chatPanelWidth, resizePanel } = useTraceViewStore(
    (state) => ({
      tracePanelWidth: state.tracePanelWidth,
      spanPanelWidth: state.spanPanelWidth,
      signalPanelWidth: state.signalPanelWidth,
      chatPanelWidth: state.chatPanelWidth,
      resizePanel: state.resizePanel,
    }),
    shallow
  );

  const traceResize = usePanelResize("trace", resizePanel);
  const spanResize = usePanelResize("span", resizePanel);
  const signalResize = usePanelResize("signal", resizePanel);
  const chatResize = usePanelResize("chat", resizePanel);

  return (
    <div className="flex flex-row-reverse h-full w-fit max-w-full overflow-x-auto">
      {/* Chat Panel */}
      {panels.showChat && panels.chatPanel && (
        <div className="relative flex h-full flex-shrink-0" style={{ width: chatPanelWidth }}>
          <LeftEdgeResizeHandle onMouseDown={chatResize.handleMouseDown} />
          {panels.chatPanel}
        </div>
      )}

      {/* Signal Events Panel */}
      {panels.showSignal && (
        <div className="relative flex h-full flex-shrink-0" style={{ width: signalPanelWidth }}>
          <LeftEdgeResizeHandle onMouseDown={signalResize.handleMouseDown} />
          {panels.signalPanel}
        </div>
      )}

      {/* Span Panel */}
      {panels.showSpan && (
        <div className="relative flex h-full flex-shrink-0" style={{ width: spanPanelWidth }}>
          <LeftEdgeResizeHandle onMouseDown={spanResize.handleMouseDown} />
          {panels.spanPanel}
        </div>
      )}

      {/* Trace Panel — always visible */}
      <div className="relative flex h-full flex-shrink-0" style={{ width: tracePanelWidth }}>
        <LeftEdgeResizeHandle onMouseDown={traceResize.handleMouseDown} />
        {panels.tracePanel}
      </div>
    </div>
  );
}
