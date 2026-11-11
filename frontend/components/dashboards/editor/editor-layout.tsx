"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { useDefaultLayout } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

// Tailwind's `xl`. A viewport query, not `@container`: container containment would offset every
// unportaled `position: fixed` overlay inside the editor (tooltips, CodeMirror autocomplete).
const WIDE_QUERY = "(min-width: 1280px)";

interface EditorLayoutProps {
  sidebar: ReactNode;
  preview: ReactNode;
}

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};

/** Settings and preview side by side with a draggable split; stacked (preview first) on narrow screens. */
export default function EditorLayout({ sidebar, preview }: EditorLayoutProps) {
  // Null on the server: the layout depends on the viewport, and the split is restored from localStorage.
  const isWide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => null
  );

  if (isWide === null) return <div className="h-full rounded-lg border" />;
  if (isWide) return <WideLayout sidebar={sidebar} preview={preview} />;
  return (
    <div className="flex h-full flex-col overflow-y-auto rounded-lg border">
      <div className="shrink-0">{preview}</div>
      <div className="shrink-0 border-t">{sidebar}</div>
    </div>
  );
}

function WideLayout({ sidebar, preview }: EditorLayoutProps) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "chart-editor-layout" });

  return (
    <ResizablePanelGroup
      id="chart-editor-panels"
      orientation="horizontal"
      className="overflow-hidden rounded-lg border"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel id="chart-editor-settings" defaultSize="50%" minSize="420px" className="flex min-w-0 flex-col">
        {sidebar}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="chart-editor-preview" minSize="360px" className="flex min-w-0 flex-col">
        {preview}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
