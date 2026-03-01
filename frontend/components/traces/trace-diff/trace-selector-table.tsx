"use client";

import { useCallback } from "react";

import TracePicker from "@/components/traces/trace-picker";
import type { TraceRow } from "@/lib/traces/types";

interface TraceSelectorTableProps {
  onSelect: (traceId: string) => void;
  excludeTraceId?: string;
}

export default function TraceSelectorTable({ onSelect, excludeTraceId }: TraceSelectorTableProps) {
  const handleTraceSelect = useCallback(
    (trace: TraceRow) => {
      onSelect(trace.id);
    },
    [onSelect]
  );

  return (
    <TracePicker
      onTraceSelect={handleTraceSelect}
      excludeTraceId={excludeTraceId}
      className="flex flex-col flex-1 gap-2 p-2 overflow-hidden"
    />
  );
}
