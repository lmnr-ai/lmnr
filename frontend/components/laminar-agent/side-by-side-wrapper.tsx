"use client";

import { type ReactNode, useCallback, useEffect, useRef } from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { useLaminarAgentStore } from "./store";

interface SideBySideWrapperProps {
  children: ReactNode;
}

export default function SideBySideWrapper({ children }: SideBySideWrapperProps) {
  const viewMode = useLaminarAgentStore((s) => s.viewMode);
  const setSideBySideContainer = useLaminarAgentStore((s) => s.setSideBySideContainer);
  const containerRef = useRef<HTMLDivElement>(null);

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

  if (viewMode !== "side-by-side") {
    return <>{children}</>;
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={65} minSize={30}>
        <div className="h-full overflow-auto">{children}</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={35} minSize={20}>
        <div ref={setRef} className="h-full" />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
