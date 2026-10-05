"use client";

import { Loader2, PlayIcon, X } from "lucide-react";
import { useParams } from "next/navigation";
import { type ReactNode, useState } from "react";
import { useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { Feature } from "@/lib/features/features";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import TestResultsView from "./test-panel/test-results-view";
import TraceChip from "./test-panel/trace-chip";
import TracePickerDialog from "./test-panel/trace-picker-dialog";
import { type ManageSignalForm } from "./types";
import useTestExecution from "./use-test-execution";

function WithTooltip({ content, children }: { content: string | null; children: ReactNode }) {
  if (!content) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-not-allowed">{children}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-60">
        <p>{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Test controls for the form footer: trace picker + run button on the left, `children`
 * (the submit button) on the right, and the result card above them.
 */
export default function TestSection({
  children,
  className,
  resultsClassName,
}: {
  children?: ReactNode;
  className?: string;
  resultsClassName?: string;
}) {
  const { projectId } = useParams();
  const featureFlags = useFeatureFlags();
  const { watch, getValues } = useFormContext<ManageSignalForm>();
  const [selectedTrace, setSelectedTrace] = useState<TraceRow | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [schemaFields, prompt, llmProfileId, llmModel] = watch(["schemaFields", "prompt", "llmProfileId", "llmModel"]);
  const hasValidFields = schemaFields?.some((f) => f.name.trim());
  // Self-hosted signals can't be saved without a profile, so a test on env credentials would be misleading.
  const missingProfile = featureFlags[Feature.SIGNAL_LLM_PROFILES] && !(llmProfileId && llmModel);

  const { isExecuting, result, error, testedTrace, execute, clear } = useTestExecution({
    getValues,
    projectId: String(projectId),
    selectedTrace,
  });

  const definitionIncomplete = !prompt
    ? "Add a prompt first"
    : !hasValidFields
      ? "Add at least one output field first"
      : null;
  const runDisabledReason =
    definitionIncomplete ??
    (missingProfile ? "Select an LLM profile and model first" : !selectedTrace ? "Select a trace first" : null);

  return (
    <TooltipProvider delayDuration={200}>
      {(isExecuting || result || error) && (
        <div className={cn("rounded-md border overflow-hidden", resultsClassName)}>
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
          <div className="flex flex-col max-h-[40vh] overflow-hidden">
            <TestResultsView
              result={result}
              trace={testedTrace}
              error={error}
              isExecuting={isExecuting}
              schemaFields={schemaFields ?? []}
            />
          </div>
        </div>
      )}

      <div className={cn("flex items-center gap-2 min-w-0", className)}>
        {selectedTrace ? (
          <TraceChip trace={selectedTrace} onClear={() => setSelectedTrace(null)} disabled={isExecuting} />
        ) : (
          <WithTooltip content={definitionIncomplete}>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setPickerOpen(true)}
              disabled={Boolean(definitionIncomplete)}
            >
              Select test trace
            </Button>
          </WithTooltip>
        )}
        <WithTooltip content={isExecuting ? null : runDisabledReason}>
          <Button
            type="button"
            variant="outline"
            size="md"
            className="gap-2"
            onClick={execute}
            disabled={Boolean(runDisabledReason) || isExecuting}
            title="Runs the current definition against the selected trace. Nothing is saved."
          >
            {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayIcon className="w-3.5 h-3.5" />}
            {isExecuting ? "Running..." : "Test"}
          </Button>
        </WithTooltip>
        {children && <div className="ml-auto shrink-0">{children}</div>}
      </div>

      {pickerOpen && (
        <TracePickerDialog
          open
          onOpenChange={setPickerOpen}
          initialTrace={selectedTrace}
          onConfirm={(trace) => {
            setSelectedTrace(trace);
            setPickerOpen(false);
          }}
        />
      )}
    </TooltipProvider>
  );
}
