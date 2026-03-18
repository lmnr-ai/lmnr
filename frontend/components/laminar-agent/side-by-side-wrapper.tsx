"use client";

import { type ReactNode } from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import AgentPanel from "./agent-panel";
import { useLaminarAgentStore } from "./store";

interface SideBySideWrapperProps {
  children: ReactNode;
}

export default function SideBySideWrapper({ children }: SideBySideWrapperProps) {
  const viewMode = useLaminarAgentStore((s) => s.viewMode);

  if (viewMode !== "side-by-side") {
    return <>{children}</>;
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={65} minSize={30}>
        <div className="h-full overflow-auto">{children}</div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={35} minSize={20}>
        <AgentPanel currentMode="side-by-side" />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
