import { useMemo, useSyncExternalStore } from "react";
import { type LayoutStorage, useDefaultLayout } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { useTraceViewStore } from "./store";
import { type TraceViewPanels } from "./trace-view-content";

// react-resizable-panels uses percentage-based sizing by default.
// These percentages approximate the pixel minimums from ALL_PANELS in the store
// (trace=500px, span/chat=375px) at typical viewport widths.
const TRACE_DEFAULT_PCT = 50;
const TRACE_MIN_PCT = 30;
const PANEL_DEFAULT_PCT = 25;
const PANEL_MIN_PCT = 20;

// useDefaultLayout's default storage dereferences `localStorage` at call time,
// which throws during SSR — guard it behind a window check.
const layoutStorage: LayoutStorage = {
  getItem: (key) => (typeof window === "undefined" ? null : localStorage.getItem(key)),
  setItem: (key, value) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, value);
    }
  },
};

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function FillWidthLayout({ panels }: { panels: TraceViewPanels }) {
  const setIsResizing = useTraceViewStore((s) => s.setIsResizing);

  const showChat = panels.showChat && !!panels.chatPanel;
  // Layouts are persisted per visible-panel set, so toggling span/chat restores
  // the layout the user last had for that combination.
  const panelIds = useMemo(
    () => ["trace", ...(panels.showSpan ? ["span"] : []), ...(showChat ? ["chat"] : [])],
    [panels.showSpan, showChat]
  );
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "trace-view-fill-layout",
    panelIds,
    storage: layoutStorage,
  });

  // Mount the panel group only on the client so the persisted layout is
  // available at Group registration time (same pattern as evaluations.tsx).
  const isClient = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
  if (!isClient) return null;

  return (
    <ResizablePanelGroup
      id="trace-view-fill"
      orientation="horizontal"
      className="h-full w-full"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      {/* Trace Panel — always visible */}
      <ResizablePanel id="trace" defaultSize={TRACE_DEFAULT_PCT} minSize={TRACE_MIN_PCT} className="overflow-hidden">
        {panels.tracePanel}
      </ResizablePanel>

      {/* Span Panel */}
      {panels.showSpan && (
        <>
          <ResizableHandle onDragChange={setIsResizing} className="hover:bg-blue-400 z-10 transition-colors" />
          <ResizablePanel id="span" defaultSize={PANEL_DEFAULT_PCT} minSize={PANEL_MIN_PCT} className="overflow-hidden">
            {panels.spanPanel}
          </ResizablePanel>
        </>
      )}

      {/* Chat Panel */}
      {showChat && (
        <>
          <ResizableHandle onDragChange={setIsResizing} className="hover:bg-blue-400 z-10 transition-colors" />
          <ResizablePanel id="chat" defaultSize={PANEL_DEFAULT_PCT} minSize={PANEL_MIN_PCT} className="overflow-hidden">
            {panels.chatPanel}
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
