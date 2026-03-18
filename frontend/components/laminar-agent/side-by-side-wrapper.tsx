"use client";

import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { type PanelImperativeHandle } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { useLaminarAgentStore } from "./store";

interface SideBySideWrapperProps {
  children: ReactNode;
}

export default function SideBySideWrapper({ children }: SideBySideWrapperProps) {
  const viewMode = useLaminarAgentStore((s) => s.viewMode);
  const setSideBySideContainer = useLaminarAgentStore((s) => s.setSideBySideContainer);
  const containerRef = useRef<HTMLDivElement>(null);
  const agentPanelRef = useRef<PanelImperativeHandle>(null);

  const isSideBySide = viewMode === "side-by-side";

  // Register/unregister the container element in the store
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      setSideBySideContainer(el);
    },
    [setSideBySideContainer]
  );

  // Clear container on unmount
  useEffect(() => () => setSideBySideContainer(null), [setSideBySideContainer]);

  // Expand/collapse the agent panel based on viewMode
  useEffect(() => {
    const panel = agentPanelRef.current;
    if (!panel) return;
    if (isSideBySide) {
      panel.resize("35%");
    } else {
      panel.resize("0%");
    }
  }, [isSideBySide]);

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize="100%" minSize="30%">
        <div className="h-full overflow-hidden relative">{children}</div>
      </ResizablePanel>
      <ResizableHandle withHandle className={isSideBySide ? "" : "hidden"} />
      <ResizablePanel panelRef={agentPanelRef} defaultSize="0%" minSize="0%" className={isSideBySide ? "" : "hidden"}>
        <div ref={setRef} className="h-full" />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
