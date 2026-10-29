"use client";

import { type EvalRow } from "@/lib/evaluation/types";

interface InspectorProps {
  row?: EvalRow;
  trialCount: number;
  taskCount: number;
  loadedTaskCount: number;
}

const omitSubRows = (row: EvalRow) => {
  const { subRows, ...rest } = row;
  return Array.isArray(subRows) ? { ...rest, subRows: `[${subRows.length} trials]` } : rest;
};

export const SandboxInspector = ({ row, trialCount, taskCount, loadedTaskCount }: InspectorProps) => (
  <div className="flex w-80 flex-none flex-col gap-3 overflow-hidden border-l p-4 text-xs">
    <div className="flex flex-col gap-0.5 text-secondary-foreground">
      <span>
        <span className="font-medium text-foreground">{trialCount}</span> trials across{" "}
        <span className="font-medium text-foreground">{taskCount}</span> tasks
      </span>
      <span>
        <span className="font-medium text-foreground">{loadedTaskCount}</span> tasks loaded
      </span>
    </div>
    <span className="font-medium text-secondary-foreground">Clicked row</span>
    {row ? (
      <pre className="min-h-0 flex-1 overflow-auto rounded bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap break-all">
        {JSON.stringify(omitSubRows(row), null, 2)}
      </pre>
    ) : (
      <span className="text-muted-foreground">Click a Trial row to inspect what the table received.</span>
    )}
  </div>
);
