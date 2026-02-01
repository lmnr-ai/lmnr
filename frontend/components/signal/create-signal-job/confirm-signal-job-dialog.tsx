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

interface ConfirmSignalJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isCreating: boolean;
  onConfirm: () => void;
  traceCount: number;
}

export default function ConfirmSignalJobDialog({
  open,
  onOpenChange,
  isCreating,
  onConfirm,
  traceCount,
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
