import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { DEFAULT_PANEL_WIDTH, MIN_PANEL_WIDTH, MIN_TREE_VIEW_WIDTH } from "./store";
import { type TraceViewPanels } from "./trace-view-content";

export default function FillWidthLayout({ panels }: { panels: TraceViewPanels }) {
  return (
    <ResizablePanelGroup id="trace-view-fill" orientation="horizontal" className="h-full w-full">
      {/* Trace Panel — always visible */}
      <ResizablePanel
        id="trace"
        defaultSize={MIN_TREE_VIEW_WIDTH}
        minSize={MIN_TREE_VIEW_WIDTH}
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
            defaultSize={DEFAULT_PANEL_WIDTH}
            minSize={MIN_PANEL_WIDTH}
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
            defaultSize={DEFAULT_PANEL_WIDTH}
            minSize={MIN_PANEL_WIDTH}
            className="overflow-hidden"
          >
            {panels.chatPanel}
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
