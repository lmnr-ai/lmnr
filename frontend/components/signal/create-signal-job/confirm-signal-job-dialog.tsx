"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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

interface ConfirmSignalJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCreating: boolean;
  onConfirm: () => void;
  traceCount: number;
  mode: number;
  onModeChange: (mode: number) => void;
}

export default function ConfirmSignalJobDialog({
  open,
  onOpenChange,
  isCreating,
  onConfirm,
  traceCount,
  mode,
  onModeChange,
}: ConfirmSignalJobDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Signal Job</DialogTitle>
          <DialogDescription>Produce events based on previous traces</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            This will create a signal job to analyze {traceCount.toLocaleString()} trace{traceCount !== 1 ? "s" : ""}.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Label className="text-sm font-medium">Processing mode</Label>
          <RadioGroup value={String(mode)} onValueChange={(v) => onModeChange(Number(v))} className="grid gap-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <RadioGroupItem value="0" className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Batch</span>
                <span className="text-xs text-muted-foreground">
                  Processing may take 1-48 hours. Recommended for cost optimization.
                </span>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <RadioGroupItem value="1" className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Realtime</span>
                <span className="text-xs text-muted-foreground">
                  Results in minutes, but each realtime signal run is billed as 2 signal runs.
                </span>
              </div>
            </label>
          </RadioGroup>
        </div>

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isCreating}>
            {isCreating && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            Create job ({traceCount.toLocaleString()} traces)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
