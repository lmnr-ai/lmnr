"use client";

import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import type { TraceRow } from "@/lib/traces/types";

import { FETCH_SIZE, tracePickerColumnOrder } from "./columns";
import TracePickerContent from "./trace-picker-content";

export interface TracePickerProps {
  onTraceSelect: (trace: TraceRow) => void;
  focusedTraceId?: string | null;
  excludeTraceId?: string;
  description?: string;
  fetchParams?: Record<string, string>;
  className?: string;
  mode?: "url" | "state";
}

const TracePicker = (props: TracePickerProps) => (
  <DataTableStateProvider defaultColumnOrder={tracePickerColumnOrder} pageSize={FETCH_SIZE}>
    <TracePickerContent {...props} />
  </DataTableStateProvider>
);

export default TracePicker;
