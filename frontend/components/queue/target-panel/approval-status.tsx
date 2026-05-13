"use client";

import { Check, Pencil } from "lucide-react";

import { cn } from "@/lib/utils";

import { isApproved, isDirty, useQueueStore } from "../queue-store";

/**
 * Approval pill driven by `status === 1`, plus a "Modified" pill that surfaces
 * when the current `edit` differs structurally from the original
 * `payload.target`. Both badges are pure derivations off the windowed item —
 * no extra fetch. Reverting an edit back to the original answer drops the
 * "Modified" pill because `isDirty` compares values, not "was edit written".
 *
 * The "Not approved" / untouched case renders nothing — an empty header is
 * the absence of state, not a noisy negative badge. Colors mirror the
 * navigator bar (`success-bright` / `amber-500`) for visual consistency
 * with the per-item segments and legend counts.
 */
export default function ApprovalStatus({ className }: { className?: string }) {
  const item = useQueueStore((s) => s.getCurrentItem());

  if (!item) return null;

  const approved = isApproved(item);
  const dirty = !approved && isDirty(item);

  if (!approved && !dirty) return null;

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
    </div>
  );
}
