"use client";

import { Check, Pencil, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { isApproved, isDirty, useQueueStore } from "../queue-store";

export default function ApprovalStatus({ className }: { className?: string }) {
  const item = useQueueStore((s) => s.getCurrentItem());
  const revertCurrent = useQueueStore((s) => s.revertCurrent);
  const ioState = useQueueStore((s) => s.ioState);

  if (!item) return null;

  const approved = isApproved(item);
  const dirty = !approved && isDirty(item);

  if (!approved && !dirty) return null;

  const canRevert = dirty && (ioState === false || ioState === "list");

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {approved ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-success-bright">
          <Check className="size-3" />
          Approved
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500">
          <Pencil className="size-3" />
          Modified
        </span>
      )}
      {dirty && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-5 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                disabled={!canRevert}
                onClick={() => revertCurrent()}
                aria-label="Revert edits"
              >
                <Undo2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Revert edits to original target</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
