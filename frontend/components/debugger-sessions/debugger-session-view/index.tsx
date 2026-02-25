"use client";

import { useParams } from "next/navigation";
import React, { useCallback } from "react";

import DebuggerSessionContent from "@/components/debugger-sessions/debugger-session-view/debugger-session-content";
import {
  MIN_SIDEBAR_WIDTH,
  useDebuggerSessionStoreContext,
} from "@/components/debugger-sessions/debugger-session-view/debugger-session-store";
import DebuggerSidebar from "@/components/debugger-sessions/debugger-session-view/sidebar";
import { useToast } from "@/lib/hooks/use-toast";

interface DebuggerSessionViewProps {
  sessionId: string;
  spanId?: string;
}

const PureDebuggerSessionView = ({ sessionId, spanId }: DebuggerSessionViewProps) => {
  const { projectId } = useParams();
  const { toast } = useToast();

  const { runRollout, cancelSession, isRolloutLoading, sidebarWidth, setSidebarWidth } = useDebuggerSessionStoreContext(
    (state) => ({
      runRollout: state.runRollout,
      cancelSession: state.cancelSession,
      isRolloutLoading: state.isRolloutLoading,
      sidebarWidth: state.sidebarWidth,
      setSidebarWidth: state.setSidebarWidth,
    })
  );

  const handleRollout = useCallback(async () => {
    const result = await runRollout(projectId as string, sessionId);
    if (result.success) {
      toast({
        title: "Debugger started successfully",
        description: "The debugger is now running with your configuration.",
      });
    } else {
      toast({
        title: "Failed to run debugger",
        description: result.error,
        variant: "destructive",
      });
    }
  }, [runRollout, projectId, sessionId, toast]);

  const handleCancel = useCallback(async () => {
    const result = await cancelSession(projectId as string, sessionId);
    if (result.success) {
      toast({
        title: "Debugger cancelled",
        description: "The debugger session has been stopped.",
      });
    } else {
      toast({
        title: "Failed to cancel debugger",
        description: result.error,
        variant: "destructive",
      });
    }
  }, [cancelSession, projectId, sessionId, toast]);

  const handleResizeSidebar = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = Math.max(MIN_SIDEBAR_WIDTH, startWidth + moveEvent.clientX - startX);
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [setSidebarWidth, sidebarWidth]
  );

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex h-full w-full min-h-0">
        <div className="flex-none border-r bg-background flex flex-col relative" style={{ width: sidebarWidth }}>
          <DebuggerSidebar onRollout={handleRollout} onCancel={handleCancel} isLoading={isRolloutLoading} />
          <div
            className="absolute top-0 right-0 h-full cursor-col-resize z-50 group w-2"
            onMouseDown={handleResizeSidebar}
          >
            <div className="absolute top-0 right-0 h-full w-px bg-border group-hover:w-0.5 group-hover:bg-blue-400 transition-colors" />
          </div>
        </div>

        <div className="flex-1">
          <DebuggerSessionContent sessionId={sessionId} spanId={spanId} />
        </div>
      </div>
    </div>
  );
};

export default function DebuggerSessionView(props: DebuggerSessionViewProps) {
  return <PureDebuggerSessionView {...props} />;
}
