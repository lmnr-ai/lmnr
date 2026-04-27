import React from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

export interface SessionViewPanels {
  sessionPanel: React.ReactNode;
  spanPanel: React.ReactNode;
  showSpan: boolean;
}

const SESSION_DEFAULT_PCT = 60;
const SESSION_MIN_PCT = 30;
const SPAN_DEFAULT_PCT = 40;
const SPAN_MIN_PCT = 20;

export default function FillWidthLayout({ panels }: { panels: SessionViewPanels }) {
  return (
    <ResizablePanelGroup id="session-view-fill" orientation="horizontal" className="h-full w-full">
      <ResizablePanel
        id="session"
        defaultSize={SESSION_DEFAULT_PCT}
        minSize={SESSION_MIN_PCT}
        className="overflow-hidden"
      >
        {panels.sessionPanel}
      </ResizablePanel>
      {panels.showSpan && (
        <>
          <ResizableHandle className="hover:bg-blue-400 z-10 transition-colors" />
          <ResizablePanel id="span" defaultSize={SPAN_DEFAULT_PCT} minSize={SPAN_MIN_PCT} className="overflow-hidden">
            {panels.spanPanel}
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
