"use client";

import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";

import { FETCH_SIZE, tracePickerColumns } from "./columns";
import TracePickerContent, { type TracePickerProps } from "./trace-picker-content";

export type { TracePickerProps };

const TracePicker = (props: TracePickerProps) => (
  <DataTableStateProvider columns={tracePickerColumns} pageSize={FETCH_SIZE} lockedColumns={["status"]}>
    <TracePickerContent {...props} />
  </DataTableStateProvider>
);

export default TracePicker;
