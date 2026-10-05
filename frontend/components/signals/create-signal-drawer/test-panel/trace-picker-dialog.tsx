import { useState } from "react";

import TracePicker from "@/components/traces/trace-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type TraceRow } from "@/lib/traces/types";

export default function TracePickerDialog({
  open,
  onOpenChange,
  initialTrace,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTrace: TraceRow | null;
  onConfirm: (trace: TraceRow) => void;
}) {
  const [stagedTrace, setStagedTrace] = useState<TraceRow | null>(initialTrace);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden flex flex-col h-[75vh] outline-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Select a trace to test signal against</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          <TracePicker
            onTraceSelect={(trace) => setStagedTrace(trace)}
            focusedTraceId={stagedTrace?.id}
            className="flex flex-col flex-1 gap-2 px-3 py-3 overflow-hidden h-full"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t">
          <Button type="button" variant="outline" size="md" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="md" disabled={!stagedTrace} onClick={() => stagedTrace && onConfirm(stagedTrace)}>
            Use selected trace
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
