"use client";

import { useCallback } from "react";

import TracePicker from "@/components/traces/trace-picker";
import type { TraceRow } from "@/lib/traces/types";

const TraceSelector = ({
  onSelect,
  excludeTraceId,
}: {
  onSelect: (traceId: string) => void;
  excludeTraceId?: string;
}) => {
  const handleTraceSelect = useCallback(
    (trace: TraceRow) => {
      onSelect(trace.id);
    },
    [onSelect]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden border border-secondary-muted-foreground bg-muted/25 rounded-md p-3 gap-2 m-0.5">
      <span className="flex-none text-sm font-medium pl-1">Select a trace to compare</span>
      <TracePicker
        onTraceSelect={handleTraceSelect}
        excludeTraceId={excludeTraceId}
        className="flex flex-col flex-1 gap-2 overflow-hidden"
        mode="url"
      />
    </div>
  );
};

export default TraceSelector;
