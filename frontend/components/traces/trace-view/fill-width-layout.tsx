import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { type TraceViewPanels } from "./trace-view-content";

// react-resizable-panels uses percentage-based sizing by default.
// These percentages approximate the pixel constants from the store
// (MIN_TREE_VIEW_WIDTH=500, DEFAULT_PANEL_WIDTH=375) at typical viewport widths.
const TRACE_DEFAULT_PCT = 50;
const TRACE_MIN_PCT = 30;
const PANEL_DEFAULT_PCT = 25;
const PANEL_MIN_PCT = 20;

export default function FillWidthLayout({ panels }: { panels: TraceViewPanels }) {
  return (
    <ResizablePanelGroup id="trace-view-fill" orientation="horizontal" className="h-full w-full">
      {/* Trace Panel — always visible */}
      <ResizablePanel
        id="trace"
        defaultSize={TRACE_DEFAULT_PCT}
        minSize={TRACE_MIN_PCT}
        className="overflow-hidden"
      >
        {panels.tracePanel}
      </ResizablePanel>

      {/* Span Panel */}
      {panels.showSpan && (
        <>
          <ResizableHandle className="hover:bg-blue-400 z-10 transition-colors" />
          <ResizablePanel
            id="span"
            defaultSize={PANEL_DEFAULT_PCT}
            minSize={PANEL_MIN_PCT}
            className="overflow-hidden"
          >
            {panels.spanPanel}
          </ResizablePanel>
        </>
      )}

      {/* Chat Panel */}
      {panels.showChat && panels.chatPanel && (
        <>
          <ResizableHandle className="hover:bg-blue-400 z-10 transition-colors" />
          <ResizablePanel
            id="chat"
            defaultSize={PANEL_DEFAULT_PCT}
            minSize={PANEL_MIN_PCT}
            className="overflow-hidden"
          >
            {panels.chatPanel}
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
