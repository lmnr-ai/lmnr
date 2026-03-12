"use client";

import { ChevronLeft, Loader2, PlayIcon, X } from "lucide-react";
import { useState } from "react";
import { type UseFormWatch } from "react-hook-form";

import TracePicker from "@/components/traces/trace-picker";
import { Button } from "@/components/ui/button";
import { type TraceRow } from "@/lib/traces/types";

import { type ManageSignalForm } from "../types";
import TestResultsView from "./test-results-view";

type TestView = "picker" | "results";

export default function TestPanel({
  watch,
  selectedTrace,
  setSelectedTrace,
  isExecuting,
  testOutput,
  execute,
  onClose,
}: {
  watch: UseFormWatch<ManageSignalForm>;
  selectedTrace: TraceRow | null;
  setSelectedTrace: (trace: TraceRow | null) => void;
  isExecuting: boolean;
  testOutput: string;
  execute: () => void;
  onClose: () => void;
}) {
  const [testView, setTestView] = useState<TestView>("picker");
  const schemaFields = watch("schemaFields");
  const hasValidFields = schemaFields?.some((f) => f.name.trim());

  // Auto-switch to results when execution completes
  const [prevExecuting, setPrevExecuting] = useState(false);
  if (isExecuting && !prevExecuting) {
    setPrevExecuting(true);
  }
  if (!isExecuting && prevExecuting && testOutput) {
    setPrevExecuting(false);
    if (testView === "picker") {
      setTestView("results");
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden border-l min-w-0 animate-in slide-in-from-right-4 fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        {testView === "results" ? (
          <button
            type="button"
            onClick={() => setTestView("picker")}
            className="flex items-center gap-1 text-sm font-medium hover:text-muted-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Test results
          </button>
        ) : (
          <span className="text-sm font-medium">Test signal</span>
        )}
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      {testView === "picker" ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden min-h-0">
            <TracePicker
              onTraceSelect={(trace) => setSelectedTrace(trace)}
              focusedTraceId={selectedTrace?.id}
              className="flex flex-col flex-1 gap-2 px-3 pb-3 overflow-hidden h-full"
            />
          </div>
          <div className="flex justify-end px-4 py-3 border-t">
            <Button
              type="button"
              variant="default"
              size="md"
              className="gap-2"
              onClick={execute}
              disabled={!watch("prompt") || !hasValidFields || !selectedTrace || isExecuting}
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
        </div>
      ) : (
        <TestResultsView output={testOutput} isExecuting={isExecuting} schemaFields={schemaFields ?? []} />
      )}
    </div>
  );
}
