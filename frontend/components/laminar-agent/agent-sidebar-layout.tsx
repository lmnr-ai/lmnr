"use client";

import { AnimatePresence, motion } from "framer-motion";
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
  const isSidebar = viewMode === "sidebar";

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

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden relative">{children}</div>
      <AnimatePresence>
        {isSidebar && (
          <motion.div
            key="agent-sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: sidebarWidth, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative flex-none border-l overflow-hidden"
          >
            <div className="h-full" style={{ minWidth: sidebarWidth }}>
              <div
                className="absolute top-0 left-0 h-full cursor-col-resize z-50 group w-2 -ml-1"
                onMouseDown={handleResizeStart}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-px bg-border group-hover:w-1 group-hover:bg-blue-400 transition-all" />
              </div>
              <SidebarPanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
