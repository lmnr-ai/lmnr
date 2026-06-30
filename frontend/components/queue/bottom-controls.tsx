"use client";

import { Check, ChevronLeft, ChevronRight, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";

import { isApproved as isApprovedItem, useQueueStore } from "./queue-store";

export default function BottomControls() {
  const { toast } = useToast();

  const itemsLen = useQueueStore((s) => s.idsList.length);
  const currentIndex = useQueueStore((s) => s.currentIndex);
  const ioState = useQueueStore((s) => s.ioState);
  const isTargetJsonValid = useQueueStore((s) => s.isTargetJsonValid);
  const isApproved = useQueueStore((s) => isApprovedItem(s.getCurrentItem()));
  const hasItem = useQueueStore((s) => !!s.getCurrentItem());

  const step = useQueueStore((s) => s.step);
  const approveCurrent = useQueueStore((s) => s.approveCurrent);
  const unapproveCurrent = useQueueStore((s) => s.unapproveCurrent);
  const discardCurrent = useQueueStore((s) => s.discardCurrent);

  const disableNav = ioState !== false && ioState !== "list";
  const canApprove = hasItem && isTargetJsonValid && !disableNav;
  const canDiscard = hasItem && !disableNav;

  const onApprove = useCallback(async () => {
    const result = await approveCurrent();
    if (!result.ok && result.error !== "Busy" && result.error !== "No item or invalid JSON") {
      toast({ variant: "destructive", title: result.error });
    }
  }, [approveCurrent, toast]);

  const onUnapprove = useCallback(async () => {
    const result = await unapproveCurrent();
    if (
      !result.ok &&
      result.error !== "Busy" &&
      result.error !== "No item" &&
      result.error !== "Item is not approved"
    ) {
      toast({ variant: "destructive", title: result.error });
    }
  }, [unapproveCurrent, toast]);

  const onDiscard = useCallback(async () => {
    const result = await discardCurrent();
    if (!result.ok && result.error !== "Busy" && result.error !== "No item") {
      toast({ variant: "destructive", title: result.error });
    }
  }, [discardCurrent, toast]);

  return (
    <div className="flex items-center justify-center">
      <div className="inline-flex items-center gap-3 rounded-lg bg-secondary border px-3 py-2">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => step(-1)}
                disabled={currentIndex <= 0}
                aria-label="previous"
              >
                <ChevronLeft className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>⌘ ←</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* "Item N of M" — explicit noun keeps this position counter from
            colliding visually with the toolbar's "N of M approved" progress
            counter. Without the prefix both reduce to the same N/M shape. */}
        <span className="text-sm px-1 tabular-nums flex items-center gap-1.5 text-secondary-foreground">
          <span className="text-secondary-foreground/70">Item</span>
          <span className="text-foreground">{Math.min(currentIndex + 1, Math.max(itemsLen, 1))}</span>
          <span>of {itemsLen}</span>
        </span>

        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => step(1)}
                disabled={currentIndex >= itemsLen - 1}
                aria-label="next"
              >
                <ChevronRight className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>⌘ →</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="h-5 w-px bg-border mx-1" />

        <Button onClick={onDiscard} disabled={!canDiscard} variant="secondary">
          {ioState === "remove" ? (
            <Loader2 className="size-3 animate-spin mr-1" />
          ) : (
            <Trash2 className="size-3.5 mr-1" />
          )}
          Discard
          <span className="ml-2 text-xs opacity-75">⌘⌫</span>
        </Button>

        {isApproved ? (
          <Button
            onClick={onUnapprove}
            disabled={disableNav}
            variant="outline"
            className="border-success-bright/40 text-success-bright hover:bg-success-bright/10"
          >
            {ioState === "save" ? (
              <Loader2 className="size-3 animate-spin mr-1" />
            ) : (
              <RotateCcw className="size-3.5 mr-1" />
            )}
            Unapprove
            <span className="ml-2 text-xs opacity-75">⌘⏎</span>
          </Button>
        ) : (
          <Button onClick={onApprove} disabled={!canApprove}>
            {ioState === "save" ? (
              <Loader2 className="size-3 animate-spin mr-1" />
            ) : (
              <Check className="size-3.5 mr-1" />
            )}
            Approve
            <span className="ml-2 text-xs opacity-75">⌘⏎</span>
          </Button>
        )}
      </div>
    </div>
  );
}
