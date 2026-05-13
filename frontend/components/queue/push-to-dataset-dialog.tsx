"use client";

import { ArrowRight, Database, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import DatasetSelect from "@/components/ui/dataset-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { isApproved as isApprovedItem, useQueueStore } from "./queue-store";

type Scope = "approved" | "all" | "current";

interface PushToDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PushToDatasetDialog({ open, onOpenChange }: PushToDatasetDialogProps) {
  const { toast } = useToast();
  const { projectId } = useParams<{ projectId: string }>();
  const dataset = useQueueStore((s) => s.dataset);
  const setDataset = useQueueStore((s) => s.setDataset);
  const ioState = useQueueStore((s) => s.ioState);
  const progress = useQueueStore((s) => s.progress);
  const itemsLen = useQueueStore((s) => s.idsList.length);
  const hasCurrent = useQueueStore((s) => !!s.getCurrentItem());
  const currentIsLabelled = useQueueStore((s) => isApprovedItem(s.getCurrentItem()));
  const pushAllToDataset = useQueueStore((s) => s.pushAllToDataset);
  const pushCurrentToDataset = useQueueStore((s) => s.pushCurrentToDataset);
  const setDialogOpen = useQueueStore((s) => s.setDialogOpen);

  // Mirror the dialog's open state into the store so window-level hotkeys
  // (defined in `QueueHotkeys`) can early-return while we're open. Radix's
  // modal overlay handles pointer events, but keyboard shortcuts bubble
  // straight to the window listener regardless of focus traps.
  useEffect(() => {
    setDialogOpen(open);
    return () => setDialogOpen(false);
  }, [open, setDialogOpen]);

  const approvedCount = progress.approved;
  const totalCount = Math.max(progress.total, itemsLen);
  const unannotatedCount = Math.max(totalCount - approvedCount, 0);

  // Pick a sensible default the moment the dialog opens. The picker remembers
  // the user's last choice for the current open session, but falls back to
  // whichever scope actually has rows so the CTA is never useless on first open.
  const defaultScope: Scope = useMemo(() => {
    if (approvedCount > 0) return "approved";
    if (hasCurrent) return "current";
    if (totalCount > 0) return "all";
    return "approved";
  }, [approvedCount, hasCurrent, totalCount]);

  const [scope, setScope] = useState<Scope>(defaultScope);

  const pushing = ioState === "push-all" || ioState === "push-one";
  const busy = ioState !== false && ioState !== "list";

  const scopeCount = scope === "approved" ? approvedCount : scope === "all" ? totalCount : hasCurrent ? 1 : 0;
  const canPush = !!dataset && scopeCount > 0 && !busy;

  const onPush = useCallback(async () => {
    if (!dataset) {
      toast({ variant: "destructive", title: "Pick a dataset first" });
      return;
    }
    const result =
      scope === "current"
        ? // When the current item isn't approved, opt into the un-annotated
          // push path so the user isn't blocked on a manual approve click.
          await pushCurrentToDataset({ includeUnlabelled: !currentIsLabelled })
        : await pushAllToDataset({ includeUnlabelled: scope === "all" });
    if (!result.ok) {
      toast({ variant: "destructive", title: result.error });
      return;
    }
    // `pushItemsToDataset` returns 200 with `{ pushed: 0 }` when nothing matched
    // (e.g. caller asked for `current` on an unapproved item). The CLAUDE.md
    // contract says we must gate success UI on `pushed > 0` — not just `res.ok`.
    if ((result.pushed ?? 0) === 0) {
      toast({ variant: "destructive", title: "Nothing was pushed — check the selected scope" });
      return;
    }
    const noun = result.pushed === 1 ? "item" : "items";
    toast({
      title: `Pushed ${result.pushed} ${noun} to dataset`,
      description: (
        <span>
          {result.pushed} {noun} added to the dataset and removed from the queue.{" "}
          <Link className="text-primary" href={`/project/${projectId}/datasets/${dataset}`}>
            Go to dataset.
          </Link>
        </span>
      ),
    });
    onOpenChange(false);
  }, [dataset, scope, currentIsLabelled, pushAllToDataset, pushCurrentToDataset, toast, projectId, onOpenChange]);

  const ctaLabel =
    scope === "current"
      ? "Push 1 item"
      : scope === "all"
        ? `Push ${totalCount} ${totalCount === 1 ? "item" : "items"}`
        : `Push ${approvedCount} ${approvedCount === 1 ? "item" : "items"}`;

  return (
    <Dialog open={open} onOpenChange={pushing ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Push to dataset</DialogTitle>
          <DialogDescription>
            Move queue items into a dataset. Pushed items are removed from the queue.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-1">
          <div className="flex flex-col gap-2">
            <Label>Dataset</Label>
            <DatasetSelect value={dataset} onChange={(d) => setDataset(d?.id)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>What to push</Label>
            <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="gap-2">
              <ScopeOption
                value="approved"
                label="All approved items"
                count={approvedCount}
                disabled={approvedCount === 0}
                hint={approvedCount === 0 ? "No approved items yet" : undefined}
              />
              <ScopeOption
                value="all"
                label="All items in queue"
                count={totalCount}
                disabled={totalCount === 0}
                hint={
                  unannotatedCount > 0
                    ? `${unannotatedCount} not yet labeled`
                    : totalCount === 0
                      ? "Queue is empty"
                      : undefined
                }
                hintTone={unannotatedCount > 0 ? "warning" : undefined}
              />
              <ScopeOption
                value="current"
                label="Just the current item"
                count={hasCurrent ? 1 : 0}
                disabled={!hasCurrent}
                hint={!hasCurrent ? "No item selected" : !currentIsLabelled ? "Not yet approved" : undefined}
                hintTone={hasCurrent && !currentIsLabelled ? "warning" : undefined}
              />
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pushing}>
            Cancel
          </Button>
          <Button onClick={onPush} disabled={!canPush}>
            {pushing ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Database className="size-3.5 mr-1" />}
            {ctaLabel}
            <ArrowRight className="size-3.5 ml-1" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ScopeOptionProps {
  value: Scope;
  label: string;
  count: number;
  disabled?: boolean;
  hint?: string;
  hintTone?: "warning";
}

function ScopeOption({ value, label, count, disabled, hint, hintTone }: ScopeOptionProps) {
  return (
    <Label
      htmlFor={`push-scope-${value}`}
      className={cn(
        "flex items-start gap-3 rounded-md border bg-secondary px-3 py-2 cursor-pointer hover:border-primary/40 transition-colors",
        disabled && "opacity-50 cursor-not-allowed hover:border-border"
      )}
    >
      <RadioGroupItem id={`push-scope-${value}`} value={value} disabled={disabled} className="mt-0.5" />
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground">{label}</span>
          <span className="text-xs tabular-nums text-secondary-foreground">{count}</span>
        </div>
        {hint && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs",
              hintTone === "warning" ? "text-amber-500/80" : "text-secondary-foreground"
            )}
          >
            {hintTone === "warning" && <TriangleAlert className="size-3" />}
            {hint}
          </span>
        )}
      </div>
    </Label>
  );
}
