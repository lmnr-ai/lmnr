"use client";

import { Check, CircleDashed, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";

import { isApproved, isDirty, useQueueStore } from "../queue-store";

/**
 * Approval pill driven by `status === 1`, plus a small "Modified" pill that
 * surfaces whenever the current `edit` differs structurally from the original
 * `payload.target`. Both badges are pure derivations off the windowed item —
 * no extra fetch. Reverting an edit back to the original answer drops the
 * "Modified" pill because `isDirty` compares values, not "was edit written".
 */
export default function ApprovalStatus({ className }: { className?: string }) {
  const item = useQueueStore((s) => s.getCurrentItem());

  if (!item) return null;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {isApproved(item) ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">
          <Check className="size-3" />
          Approved
        </span>
      ) : isDirty(item) ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
          <Pencil className="size-3" />
          Modified
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-secondary-foreground">
          <CircleDashed className="size-3" />
          Not approved
        </span>
      )}
    </div>
  );
}
