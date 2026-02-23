"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useState } from "react";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/use-toast.ts";

interface OpenInDebuggerDialogProps {
  trace?: TraceViewTrace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OpenInDebuggerDialog = ({ open, onOpenChange, trace }: OpenInDebuggerDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const params = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const handleSubmit = useCallback(async () => {
    if (!trace?.id) {
      return;
    }

    try {
      setIsLoading(true);
      const startDate = new Date(new Date(trace.startTime).getTime() - 1000);
      const endDate = new Date(new Date(trace.endTime).getTime() + 1000);

      const res = await fetch(`/api/projects/${params.projectId}/traces/${trace.id}/debugger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: startDate.toISOString().replace("Z", ""),
          endDate: endDate.toISOString().replace("Z", ""),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Failed to open in debugger." }));
        throw new Error(errorData.error || "Failed to open in debugger.");
      }

      const data = (await res.json()) as { sessionId: string };

      onOpenChange(false);

      window.open(`/project/${params.projectId}/rollout-sessions/${data.sessionId}`, "_blank");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to open in debugger.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [onOpenChange, params.projectId, toast, trace?.endTime, trace?.id, trace?.startTime]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open in Debugger</DialogTitle>
          <DialogDescription>
            Start your local debugger first, then continue to opening this trace in your rollout session.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-foreground text-sm">Run this command in your terminal:</p>
            <div className="flex items-center gap-2 bg-background border rounded-md px-3 py-2 text-sm font-mono">
              <code className="flex-1 text-secondary-foreground">npx lmnr-cli dev path/to/entrypoint</code>
              <CopyButton
                text="npx lmnr-cli dev path/to/entrypoint"
                size="icon"
                variant="ghost"
                iconClassName="w-3.5 h-3.5"
                className="h-6 w-6"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline" disabled={isLoading}>
            Cancel
          </Button>
          <Button disabled={isLoading} onClick={handleSubmit}>
            {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            <span>Open in Debugger</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OpenInDebuggerDialog;
