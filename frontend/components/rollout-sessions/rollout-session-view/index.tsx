"use client";

import { useParams } from "next/navigation";
import React, { useCallback } from "react";

import RolloutSessionContent from "@/components/rollout-sessions/rollout-session-view/rollout-session-content";
import {
  MIN_SIDEBAR_WIDTH,
  useRolloutSessionStoreContext,
} from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import RolloutSidebar from "@/components/rollout-sessions/rollout-session-view/sidebar";
import { useToast } from "@/lib/hooks/use-toast";

interface RolloutSessionViewProps {
  sessionId: string;
  spanId?: string;
}

const PureRolloutSessionView = ({ sessionId, spanId }: RolloutSessionViewProps) => {
  const { projectId } = useParams();
  const { toast } = useToast();

  const { runRollout, cancelSession, isRolloutLoading, sidebarWidth, setSidebarWidth } = useRolloutSessionStoreContext(
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
        title: "Rollout started successfully",
        description: "The rollout is now running with your configuration.",
      });
    } else {
      toast({
        title: "Failed to run rollout",
        description: result.error,
        variant: "destructive",
      });
    }
  }, [runRollout, projectId, sessionId, toast]);

  const handleCancel = useCallback(async () => {
    const result = await cancelSession(projectId as string, sessionId);
    if (result.success) {
      toast({
        title: "Rollout cancelled",
        description: "The rollout session has been stopped.",
      });
    } else {
      toast({
        title: "Failed to cancel rollout",
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
          <RolloutSidebar onRollout={handleRollout} onCancel={handleCancel} isLoading={isRolloutLoading} />
          <div
            className="absolute top-0 right-0 h-full cursor-col-resize z-50 group w-2"
            onMouseDown={handleResizeSidebar}
          >
            <div className="absolute top-0 right-0 h-full w-px bg-border group-hover:w-0.5 group-hover:bg-blue-400 transition-colors" />
          </div>
        </div>

        <div className="flex-1">
          <RolloutSessionContent sessionId={sessionId} spanId={spanId} />
        </div>
      </div>
    </div>
  );
};

export default function RolloutSessionView(props: RolloutSessionViewProps) {
  return <PureRolloutSessionView {...props} />;
}
