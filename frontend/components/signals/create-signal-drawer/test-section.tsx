"use client";

import { Info, Loader2, PlayIcon, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";

import TracePicker from "@/components/traces/trace-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type TraceRow } from "@/lib/traces/types";

import TestResultsView from "./test-panel/test-results-view";
import { type ManageSignalForm } from "./types";
import useTestExecution from "./use-test-execution";

function TraceChip({ trace, onClear, disabled }: { trace: TraceRow; onClear: () => void; disabled?: boolean }) {
  const label = trace.topSpanName || trace.id;
  return (
    <div
      className={`flex items-center gap-2 min-w-0 max-w-full rounded-md border bg-secondary/50 pl-2 pr-1 h-7 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <span className="text-xs text-muted-foreground shrink-0">Trace</span>
      <span className="text-xs font-medium truncate min-w-0" title={label}>
        {label}
      </span>
      <span className="text-xs text-muted-foreground font-mono shrink-0" title={trace.id}>
        {trace.id.slice(0, 8)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onClear}
        disabled={disabled}
        aria-label="Clear selected trace"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export default function TestSection() {
  const { projectId } = useParams();
  const { watch, getValues } = useFormContext<ManageSignalForm>();
  const [selectedTrace, setSelectedTrace] = useState<TraceRow | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stagedTrace, setStagedTrace] = useState<TraceRow | null>(null);

  const schemaFields = watch("schemaFields");
  const prompt = watch("prompt");
  const hasValidFields = schemaFields?.some((f) => f.name.trim());

  const { isExecuting, testOutput, execute, clear } = useTestExecution({
    getValues,
    projectId: String(projectId),
    selectedTrace,
  });

  const handleOpenPicker = useCallback(() => {
    setStagedTrace(selectedTrace);
    setPickerOpen(true);
  }, [selectedTrace]);

  const handleConfirm = useCallback(() => {
    setSelectedTrace(stagedTrace);
    setPickerOpen(false);
  }, [stagedTrace]);

  const canSelectTrace = Boolean(prompt) && Boolean(hasValidFields);
  const canRun = canSelectTrace && Boolean(selectedTrace) && !isExecuting;
  const selectDisabledReason = !prompt
    ? "Add a prompt first"
    : !hasValidFields
      ? "Add at least one output field first"
      : null;

  return (
    <div className="grid gap-1.5">
      <TooltipProvider delayDuration={200}>
        <div className="flex items-center gap-1.5">
          <Label className="text-sm font-medium">Test</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-60">
              <p>Test the current signal against a selected trace. Nothing is saved.</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      <div className="flex items-center gap-2 min-w-0">
        {selectedTrace ? (
          <TraceChip trace={selectedTrace} onClear={() => setSelectedTrace(null)} disabled={isExecuting} />
        ) : (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={!canSelectTrace ? "cursor-not-allowed" : undefined}>
                  <Button type="button" variant="outline" onClick={handleOpenPicker} disabled={!canSelectTrace}>
                    Select trace
                  </Button>
                </span>
              </TooltipTrigger>
              {selectDisabledReason && (
                <TooltipContent side="top">
                  <p>{selectDisabledReason}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}
        <Button
          type="button"
          variant="secondary"
          className="gap-2 border-border bg-secondary/50"
          onClick={execute}
          disabled={!canRun}
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <PlayIcon className="w-3.5 h-3.5" />
              Run test
            </>
          )}
        </Button>
      </div>

      {(isExecuting || testOutput) && (
        <div className="mt-2 rounded-md border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-secondary/30">
            <span className="text-xs font-medium text-secondary-foreground">Test result</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mr-1"
              onClick={clear}
              disabled={isExecuting}
              aria-label="Dismiss test result"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex flex-col max-h-96 overflow-hidden">
            <TestResultsView output={testOutput} isExecuting={isExecuting} schemaFields={schemaFields ?? []} />
          </div>
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
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
            <Button type="button" variant="outline" size="md" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="md" disabled={!stagedTrace} onClick={handleConfirm}>
              Use selected trace
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
