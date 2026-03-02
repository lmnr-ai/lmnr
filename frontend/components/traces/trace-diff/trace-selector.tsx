"use client";

import TraceSelectorTable from "./trace-selector-table";

export default function TraceSelector({
  onSelect,
  excludeTraceId,
}: {
  onSelect: (traceId: string) => void;
  excludeTraceId?: string;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden border border-secondary-muted-foreground bg-muted/25 rounded p-3 gap-2 m-0.5">
      <span className="flex-none text-sm font-medium">Select a trace to compare</span>
      <TraceSelectorTable onSelect={onSelect} excludeTraceId={excludeTraceId} />
    </div>
  );
}
