"use client";

import { AlertTriangle, Loader2, Play, Radio, Square } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback } from "react";

import { useRolloutSessionStoreContext } from "@/components/rollout-sessions/rollout-session-view/rollout-session-store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks/use-toast";

interface PlaceholderProps {
  sessionId: string;
}

export default function Placeholder({ sessionId }: PlaceholderProps) {
  const { projectId } = useParams();
  const { toast } = useToast();

  const {
    isRolloutRunning,
    setIsRolloutRunning,
    rolloutError,
    setRolloutError,
    sessionStatus,
    setSessionStatus,
    paramValues,
    getOverridesForRollout,
  } = useRolloutSessionStoreContext((state) => ({
    isRolloutRunning: state.isRolloutRunning,
    setIsRolloutRunning: state.setIsRolloutRunning,
    rolloutError: state.rolloutError,
    setRolloutError: state.setRolloutError,
    sessionStatus: state.sessionStatus,
    setSessionStatus: state.setSessionStatus,
    paramValues: state.paramValues,
    getOverridesForRollout: state.getOverridesForRollout,
  }));

  const isRunning = sessionStatus === "RUNNING";
  const canRun = sessionStatus === "PENDING" || sessionStatus === "FINISHED" || sessionStatus === "STOPPED";

  const handleRollout = useCallback(async () => {
    try {
      setIsRolloutRunning(true);
      setRolloutError(undefined);

      const rolloutPayload = {
        args: paramValues,
      };

      const response = await fetch(`/api/projects/${projectId}/rollouts/${sessionId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rolloutPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to run rollout");
      }

      await response.json();

      setSessionStatus("RUNNING");

      toast({
        title: "Rollout started successfully",
        description: "The rollout is now running. Traces will appear shortly.",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to run rollout";
      setRolloutError(errorMessage);
      toast({
        title: "Failed to run rollout",
        description: errorMessage,
        variant: "destructive",
      });
      console.error("Rollout error:", error);
    } finally {
      setIsRolloutRunning(false);
    }
  }, [
    projectId,
    sessionId,
    paramValues,
    getOverridesForRollout,
    setIsRolloutRunning,
    setRolloutError,
    setSessionStatus,
    toast,
  ]);

  const handleCancel = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/rollouts/${sessionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "STOPPED" }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to cancel rollout");
      }

      setSessionStatus("STOPPED");

      toast({
        title: "Rollout cancelled",
        description: "The rollout session has been stopped.",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to cancel rollout";
      toast({
        title: "Failed to cancel rollout",
        description: errorMessage,
        variant: "destructive",
      });
      console.error("Cancel error:", error);
    }
  }, [projectId, sessionId, setSessionStatus, toast]);

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 p-6 rounded-lg border bg-card text-card-foreground">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-sm text-muted-foreground">
            {isRunning ? "Running rollout..." : "Waiting for traces..."}
          </span>
        </div>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          {isRunning
            ? "The rollout is running. Traces will appear here once they arrive."
            : "Run the rollout to start, or traces will appear here when your code runs."}
        </p>

        {rolloutError && (
          <Alert variant="destructive" className="max-w-sm">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{rolloutError}</AlertDescription>
          </Alert>
        )}

        {isRunning ? (
          <Button variant="destructive" onClick={handleCancel}>
            <Square size={14} className="mr-2" />
            Cancel
          </Button>
        ) : (
          <Button onClick={handleRollout} disabled={isRolloutRunning || !canRun}>
            {isRolloutRunning ? (
              <>
                <Loader2 size={14} className="mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play size={14} className="mr-2" />
                Run Rollout
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
