"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ArrowRight, Check, X } from "lucide-react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import Mono from "@/components/ui/mono";
import { type Trace } from "@/lib/traces/types";

import { PlaygroundHistoryChrome } from "./chrome";
import { PlaygroundHistoryGrid } from "./grid";

const renderCost = (val: any) => {
  if (val == null) return "-";
  const parsed = parseFloat(val);
  return isNaN(parsed) ? "-" : `$${parsed.toFixed(5)}`;
};

const columns: ColumnDef<Trace, any>[] = [
  {
    cell: (row) => (
      <div className="flex h-full justify-center items-center w-10">
        {row.getValue() ? (
          <X className="self-center text-destructive" size={18} />
        ) : (
          <Check className="text-success" size={18} />
        )}
      </div>
    ),
    accessorKey: "status",
    header: "Status",
    id: "status",
    size: 70,
  },
  {
    cell: (row) => <Mono className="text-xs">{row.getValue()}</Mono>,
    header: "ID",
    accessorKey: "id",
    id: "id",
    size: 200,
  },
  {
    accessorKey: "topSpanType",
    header: "Type",
    id: "top_span_type",
    cell: (row) => (
      <div className="cursor-pointer flex gap-2 items-center">
        <div className="flex items-center gap-2">
          {row.row.original.topSpanName && <SpanTypeIcon className="z-10" spanType={row.getValue()} />}
        </div>
        {row.row.original.topSpanName && (
          <div className="flex text-sm text-ellipsis overflow-hidden whitespace-nowrap">
            {row.row.original.topSpanName}
          </div>
        )}
      </div>
    ),
    size: 150,
  },
  {
    cell: (row) => (
      <div className="text-ellipsis overflow-hidden whitespace-nowrap max-w-[200px]">{row.getValue()}</div>
    ),
    accessorKey: "topSpanInputPreview",
    header: "Input",
    id: "input",
    size: 200,
  },
  {
    cell: (row) => (
      <div className="text-ellipsis overflow-hidden whitespace-nowrap max-w-[200px]">{row.getValue()}</div>
    ),
    accessorKey: "topSpanOutputPreview",
    header: "Output",
    id: "output",
    size: 200,
  },
  {
    accessorFn: (row) => row.startTime,
    header: "Timestamp",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "start_time",
    size: 125,
  },
  {
    accessorFn: (row) => {
      const start = new Date(row.startTime);
      const end = new Date(row.endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return "-";
      return `${((end.getTime() - start.getTime()) / 1000).toFixed(2)}s`;
    },
    header: "Latency",
    id: "latency",
    size: 80,
  },
  {
    accessorFn: (row) => row.cost,
    header: "Cost",
    id: "cost",
    cell: (row) => renderCost(row.getValue()),
    size: 100,
  },
  {
    accessorFn: (row) => row.totalTokenCount ?? "-",
    header: "Tokens",
    id: "total_token_count",
    cell: (row) => (
      <div className="flex items-center text-sm">
        {`${row.row.original.inputTokenCount ?? "-"}`}
        <ArrowRight size={12} className="mx-1 min-w-[12px]" />
        {`${row.row.original.outputTokenCount ?? "-"}`}
        {` (${row.row.original.totalTokenCount ?? "-"})`}
      </div>
    ),
    size: 150,
  },
];

export const defaultPlaygroundHistoryColumnOrder = [
  "status",
  "id",
  "top_span_type",
  "input",
  "output",
  "start_time",
  "latency",
  "cost",
  "total_token_count",
];

interface PlaygroundHistoryTableProps {
  playgroundId: string;
  onRowClick?: (trace: Trace) => void;
  onTraceSelect?: (traceId: string) => void;
}

export default function PlaygroundHistoryTable(props: PlaygroundHistoryTableProps) {
  const chrome = <PlaygroundHistoryChrome columns={columns} />;

  return (
    <InfiniteDataTableProvider uniqueKey="id" defaults={{ columnOrder: defaultPlaygroundHistoryColumnOrder }}>
      <PlaygroundHistoryGrid chrome={chrome} columns={columns} {...props} />
    </InfiniteDataTableProvider>
  );
}
