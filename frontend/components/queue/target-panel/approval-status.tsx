"use client";

import { Check, CircleDashed } from "lucide-react";

import { cn } from "@/lib/utils";

import { useQueueStore } from "../queue-store";

/**
 * Pill that surfaces the current item's approval state. Approved items
 * use a filled green styling so the user can immediately tell from a glance
 * that the row is locked in.
 */
export default function ApprovalStatus({ className }: { className?: string }) {
  const isLabelled = useQueueStore((s) => s.getCurrentItem()?.isLabelled ?? false);
  const hasItem = useQueueStore((s) => !!s.getCurrentItem());

  if (!hasItem) return null;

  if (isLabelled) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500",
          className
        )}
      >
        <Check className="size-3" />
        Approved
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-secondary-foreground",
        className
      )}
    >
      <CircleDashed className="size-3" />
      Not approved
    </span>
  );
}
