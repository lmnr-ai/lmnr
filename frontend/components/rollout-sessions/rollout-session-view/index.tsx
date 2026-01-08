"use client";

import { useParams } from "next/navigation";
import React, { useCallback } from "react";

import RolloutSessionContent from "@/components/rollout-sessions/rollout-session-view/rollout-session-content";
import { useRolloutSessionStoreContext } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import RolloutSidebar from "@/components/rollout-sessions/rollout-session-view/sidebar";
import { useToast } from "@/lib/hooks/use-toast";

interface RolloutSessionViewProps {
  sessionId: string;
  spanId?: string;
}

const PureRolloutSessionView = ({ sessionId, spanId }: RolloutSessionViewProps) => {
  const { projectId } = useParams();
  const { toast } = useToast();

  const { runRollout, cancelSession, isRolloutLoading } = useRolloutSessionStoreContext((state) => ({
    runRollout: state.runRollout,
    cancelSession: state.cancelSession,
    isRolloutLoading: state.isRolloutLoading,
  }));

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

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex h-full w-full min-h-0">
        <div className="flex-none w-1/3 border-r bg-background flex flex-col">
          <RolloutSidebar onRollout={handleRollout} onCancel={handleCancel} isLoading={isRolloutLoading} />
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
