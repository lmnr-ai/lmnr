import React from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

export interface SessionViewPanels {
  sessionPanel: React.ReactNode;
  spanPanel: React.ReactNode;
  mediaPanel: React.ReactNode;
  showSpan: boolean;
  showMedia: boolean;
}

// Panels collapse as more become visible; we re-normalize so visible panels
// always occupy 100%. With media + span both open, session is narrowest.
interface PanelSizes {
  session: number;
  span: number;
  media: number;
}

const SIZES = {
  session_only: { session: 100, span: 0, media: 0 },
  session_span: { session: 60, span: 40, media: 0 },
  session_media: { session: 55, span: 0, media: 45 },
  session_span_media: { session: 34, span: 33, media: 33 },
} satisfies Record<string, PanelSizes>;

export default function FillWidthLayout({ panels }: { panels: SessionViewPanels }) {
  const sizes: PanelSizes =
    panels.showSpan && panels.showMedia
      ? SIZES.session_span_media
      : panels.showSpan
        ? SIZES.session_span
        : panels.showMedia
          ? SIZES.session_media
          : SIZES.session_only;

  return (
    <ResizablePanelGroup id="session-view-fill" orientation="horizontal" className="h-full w-full">
      <ResizablePanel id="session" defaultSize={sizes.session} minSize={25} className="overflow-hidden">
        {panels.sessionPanel}
      </ResizablePanel>
      {panels.showSpan && (
        <>
          <ResizableHandle className="hover:bg-blue-400 z-10 transition-colors" />
          <ResizablePanel id="span" defaultSize={sizes.span} minSize={20} className="overflow-hidden">
            {panels.spanPanel}
          </ResizablePanel>
        </>
      )}
      {panels.showMedia && (
        <>
          <ResizableHandle className="hover:bg-blue-400 z-10 transition-colors" />
          <ResizablePanel id="media" defaultSize={sizes.media} minSize={20} className="overflow-hidden">
            {panels.mediaPanel}
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
