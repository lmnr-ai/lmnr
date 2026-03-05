"use client";

import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";

import { FETCH_SIZE, tracePickerColumnOrder } from "./columns";
import TracePickerContent, { type TracePickerProps } from "./trace-picker-content";

export type { TracePickerProps };

const TracePicker = (props: TracePickerProps) => (
  <DataTableStateProvider defaultColumnOrder={tracePickerColumnOrder} pageSize={FETCH_SIZE}>
    <TracePickerContent {...props} />
  </DataTableStateProvider>
);

export default TracePicker;
