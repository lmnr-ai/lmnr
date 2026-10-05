"use client";

import { Loader2, PlayIcon, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import TracePicker from "@/components/traces/trace-picker";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type TraceRow } from "@/lib/traces/types";

import { type ManageSignalForm } from "../types";
import useTestExecution from "../use-test-execution";
import TestResultsView from "./test-results-view";

/**
 * Stays mounted while closed so the selected trace and last result survive reopening;
 * Radix only unmounts the content.
 */
export default function TestDialog({
  open,
  onOpenChange,
  blockedReason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Re-checked here because the form can be reset while the modal is open (panel `initialValues` sync).
  blockedReason: string | null;
}) {
  const { projectId } = useParams();
  const { watch, getValues } = useFormContext<ManageSignalForm>();
  const [selectedTrace, setSelectedTrace] = useState<TraceRow | null>(null);
  const [previewTraceId, setPreviewTraceId] = useState<string | null>(null);
  const schemaFields = watch("schemaFields");

  const { isExecuting, result, error, execute, reset } = useTestExecution({
    getValues,
    projectId: String(projectId),
    selectedTrace,
  });
  const hasOutput = isExecuting || result || error;

  const handleTraceSelect = (trace: TraceRow) => {
    // The result pane only ever describes the selected trace.
    if (trace.id !== selectedTrace?.id) reset();
    setSelectedTrace(trace);
    setPreviewTraceId(trace.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0 gap-0 overflow-hidden flex flex-col h-[80vh] outline-0">
        <div className="flex items-start justify-between gap-4 px-4 pt-4 pb-2">
          <DialogHeader>
            <DialogTitle>Test signal</DialogTitle>
            <DialogDescription>
              Pick a trace and run the current definition against it. Nothing is saved.
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 -mr-1 shrink-0" aria-label="Close">
              <X className="w-4 h-4" />
            </Button>
          </DialogClose>
        </div>
        <div className="flex flex-1 min-h-0 border-t">
          <div className="relative flex-1 min-w-0 overflow-hidden border-r">
            {/* The picker stays mounted under the preview so its date range and scroll survive. */}
            <TracePicker
              onTraceSelect={handleTraceSelect}
              focusedTraceId={selectedTrace?.id}
              className="flex flex-col flex-1 gap-2 px-3 py-3 overflow-hidden h-full"
            />
            {previewTraceId && (
              <TraceViewSidePanel
                key={previewTraceId}
                traceId={previewTraceId}
                onClose={() => setPreviewTraceId(null)}
              />
            )}
          </div>
          <div className="flex flex-col w-[440px] shrink-0 min-h-0">
            <div className="px-3 py-2 border-b text-xs font-medium text-secondary-foreground">Result</div>
            {hasOutput ? (
              <TestResultsView
                result={result}
                trace={selectedTrace}
                error={error}
                isExecuting={isExecuting}
                schemaFields={schemaFields ?? []}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
                Select a trace and run the test to see what this signal extracts from it.
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-3 border-t">
              {blockedReason && <span className="text-xs text-destructive">{blockedReason}</span>}
              <Button
                type="button"
                size="md"
                className="ml-auto gap-2 shrink-0"
                onClick={execute}
                disabled={Boolean(blockedReason) || !selectedTrace || isExecuting}
              >
                {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayIcon className="w-3.5 h-3.5" />}
                {isExecuting ? "Running..." : "Run"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
