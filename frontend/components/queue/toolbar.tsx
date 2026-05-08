"use client";

import { Check, Database } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import PushToDatasetDialog from "./push-to-dataset-dialog";
import { useQueueStore } from "./queue-store";

export default function Toolbar() {
  const progress = useQueueStore((s) => s.progress);
  const itemsLen = useQueueStore((s) => s.idsList.length);

  const [pushOpen, setPushOpen] = useState(false);

  const total = Math.max(progress.total, itemsLen);
  const approved = progress.labelled;
  const pushPct = total === 0 ? 0 : Math.round((approved / total) * 100);
  const isComplete = total > 0 && approved === total;

  // Disable trigger only when the queue is genuinely empty. The dialog itself
  // handles every "approved=0 / no current / no dataset" sub-case so the user
  // sees an explanatory hint instead of a silently-disabled button.
  const triggerDisabled = total === 0;
  const triggerHint = triggerDisabled
    ? "Queue is empty"
    : approved === 0
      ? "No approved items yet — you can still push everything in queue"
      : undefined;

  return (
    <>
      <div className="flex items-center gap-3 h-9">
        <div
          className={cn(
            "flex flex-1 items-center gap-3 h-full border rounded-lg px-3 min-w-0 transition-colors",
            isComplete ? "bg-green-500/10 border-green-500/40" : "bg-secondary"
          )}
        >
          <div className={cn("flex items-center gap-1.5", isComplete ? "text-green-500" : "text-foreground")}>
            <Check className="size-3.5" />
            <span className="text-sm font-medium tabular-nums">
              {approved}
              <span className="text-secondary-foreground"> of {total}</span>
            </span>
            <span className="text-xs text-secondary-foreground">approved</span>
          </div>
          <div className="flex-1 min-w-0">
            <Progress
              value={pushPct}
              className="h-1.5"
              indicatorClassName={cn(isComplete ? "bg-green-500" : "bg-primary")}
            />
          </div>
        </div>

        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Span wrapper keeps the tooltip working when the button is disabled. */}
              <span className="inline-flex">
                <Button onClick={() => setPushOpen(true)} disabled={triggerDisabled} className="h-9">
                  <Database className="size-3.5 mr-1" />
                  Push to dataset
                </Button>
              </span>
            </TooltipTrigger>
            {triggerHint && <TooltipContent>{triggerHint}</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
      </div>

      <PushToDatasetDialog open={pushOpen} onOpenChange={setPushOpen} />
    </>
  );
}
