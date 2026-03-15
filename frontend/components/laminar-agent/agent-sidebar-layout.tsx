"use client";

import { type ReactNode, useCallback, useState } from "react";

import SidebarPanel from "./sidebar-panel";
import { useLaminarAgentStore } from "./store";

const DEFAULT_SIDEBAR_WIDTH = 400;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 600;

interface AgentSidebarLayoutProps {
  children: ReactNode;
}

export default function AgentSidebarLayout({ children }: AgentSidebarLayoutProps) {
  const viewMode = useLaminarAgentStore((s) => s.viewMode);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + delta));
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [sidebarWidth]
  );

  if (viewMode !== "sidebar") {
    return <div className="flex-1 flex flex-col min-h-0">{children}</div>;
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">{children}</div>
      <div className="relative flex-none border-l" style={{ width: sidebarWidth }}>
        <div
          className="absolute top-0 left-0 h-full cursor-col-resize z-50 group w-2 -ml-1"
          onMouseDown={handleResizeStart}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-px bg-border group-hover:w-0.5 group-hover:bg-blue-400 transition-colors" />
        </div>
        <SidebarPanel />
      </div>
    </div>
  );
}
