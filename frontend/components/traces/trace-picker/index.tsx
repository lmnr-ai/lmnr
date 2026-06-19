"use client";

import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";

import { FETCH_SIZE, tracePickerColumnOrder } from "./columns";
import TracePickerContent, { type TracePickerProps } from "./trace-picker-content";

export type { TracePickerProps };

const TracePicker = (props: TracePickerProps) => (
  <InfiniteDataTableProvider
    defaults={{ columnOrder: tracePickerColumnOrder }}
    pageSize={FETCH_SIZE}
    lockedColumns={["status"]}
  >
    <TracePickerContent {...props} />
  </InfiniteDataTableProvider>
);

export default TracePicker;
