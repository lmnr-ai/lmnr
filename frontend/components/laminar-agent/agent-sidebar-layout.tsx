"use client";

import { type ReactNode } from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import SidebarPanel from "./sidebar-panel";
import { useLaminarAgentStore } from "./store";

interface AgentSidebarLayoutProps {
  children: ReactNode;
}

export default function AgentSidebarLayout({ children }: AgentSidebarLayoutProps) {
  const viewMode = useLaminarAgentStore((s) => s.viewMode);

  if (viewMode !== "sidebar") {
    return <>{children}</>;
  }

  return (
    <ResizablePanelGroup id="agent-sidebar-panels" orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={65} minSize={30}>
        {children}
      </ResizablePanel>
      <ResizableHandle className="hover:bg-blue-400 transition-colors" />
      <ResizablePanel defaultSize={35} minSize={20} maxSize={50}>
        <SidebarPanel />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
