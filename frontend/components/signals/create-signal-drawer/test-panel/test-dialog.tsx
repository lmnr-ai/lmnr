"use client";

import { Loader2, PlayIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import TracePicker from "@/components/traces/trace-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type TraceRow } from "@/lib/traces/types";

import { type ManageSignalForm } from "../types";
import useTestExecution from "../use-test-execution";
import TestResultsView from "./test-results-view";
import TraceChip from "./trace-chip";

/**
 * Stays mounted while closed so the selected trace and last result survive reopening;
 * Radix only unmounts the content.
 */
export default function TestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { projectId } = useParams();
  const { watch, getValues } = useFormContext<ManageSignalForm>();
  const [selectedTrace, setSelectedTrace] = useState<TraceRow | null>(null);
  const schemaFields = watch("schemaFields");

  const { isExecuting, result, error, testedTrace, execute } = useTestExecution({
    getValues,
    projectId: String(projectId),
    selectedTrace,
  });
  const hasOutput = isExecuting || result || error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0 gap-0 overflow-hidden flex flex-col h-[80vh] outline-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Test signal</DialogTitle>
          <DialogDescription>
            Pick a trace and run the current definition against it. Nothing is saved.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-1 min-h-0 border-t">
          <div className="flex-1 min-w-0 overflow-hidden border-r">
            <TracePicker
              onTraceSelect={setSelectedTrace}
              focusedTraceId={selectedTrace?.id}
              className="flex flex-col flex-1 gap-2 px-3 py-3 overflow-hidden h-full"
            />
          </div>
          <div className="flex flex-col w-[440px] shrink-0 min-h-0">
            <div className="px-3 py-2 border-b text-xs font-medium text-secondary-foreground">Result</div>
            {hasOutput ? (
              <TestResultsView
                result={result}
                trace={testedTrace}
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
              {selectedTrace ? (
                <TraceChip trace={selectedTrace} onClear={() => setSelectedTrace(null)} disabled={isExecuting} />
              ) : (
                <span className="text-xs text-muted-foreground">No trace selected</span>
              )}
              <Button
                type="button"
                size="md"
                className="ml-auto gap-2 shrink-0"
                onClick={execute}
                disabled={!selectedTrace || isExecuting}
              >
                {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayIcon className="w-3.5 h-3.5" />}
                {isExecuting ? "Running..." : "Run test"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
