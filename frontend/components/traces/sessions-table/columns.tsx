import { ColumnDef } from "@tanstack/react-table";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { ColumnFilter } from "@/components/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { getDurationString } from "@/lib/flow/utils";
import { SessionPreview, Trace } from "@/lib/traces/types";

type SessionRow = {
  type: string;
  data: SessionPreview | Trace;
  subRows: SessionRow[];
};

export const columns: ColumnDef<SessionRow, any>[] = [
  {
    header: "Type",
    cell: ({ row }) =>
      row.original.type === "session" ? (
        <div className="flex items-center gap-2">
          <span className="">Session</span>
          {row.getIsExpanded() ? (
            <ChevronDownIcon className="w-4 text-secondary-foreground" />
          ) : (
            <ChevronRightIcon className="w-4 text-secondary-foreground" />
          )}
        </div>
      ) : (
        <div>
          <span className="text-gray-500">Trace</span>
        </div>
      ),
    id: "type",
    size: 120,
  },
  {
    accessorFn: (row) => (row.data.id === null ? "-" : row.data.id),
    header: "ID",
    id: "id",
    cell: (row) => <Mono className="text-xs">{row.getValue()}</Mono>,
  },
  {
    accessorFn: (row) => row.data.startTime,
    header: "Start time",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "start_time",
  },
  {
    accessorFn: (row) => {
      if (row.type === "trace") {
        return getDurationString(row.data.startTime, row.data.endTime);
      }

      return (row.data as SessionPreview).duration.toFixed(3) + "s";
    },
    header: "Duration",
    size: 100,
  },
  {
    accessorFn: (row) => "$" + row.data.inputCost?.toFixed(5),
    header: "Input cost",
    id: "input_cost",
    size: 120,
  },
  {
    accessorFn: (row) => "$" + row.data.outputCost?.toFixed(5),
    header: "Output cost",
    id: "output_cost",
    size: 120,
  },
  {
    accessorFn: (row) => "$" + row.data.cost?.toFixed(5),
    header: "Total cost",
    id: "cost",
    size: 120,
  },
  {
    accessorFn: (row) => row.data.inputTokenCount,
    header: "Input tokens",
    id: "input_token_count",
    size: 120,
  },
  {
    accessorFn: (row) => row.data.outputTokenCount,
    header: "Output tokens",
    id: "output_token_count",
    size: 120,
  },
  {
    accessorFn: (row) => row.data.totalTokenCount,
    header: "Total tokens",
    id: "total_token_count",
    size: 120,
  },
  {
    accessorFn: (row) => (row.type === "session" ? ((row.data as SessionPreview).traceCount ?? 0) : "-"),
    header: "Trace Count",
    id: "trace_count",
    size: 120,
  },
  {
    accessorFn: (row) => (row.type === "session" ? "-" : (row.data as Trace).userId),
    header: "User ID",
    id: "user_id",
    cell: (row) => <Mono className="text-xs">{row.getValue()}</Mono>,
  },
];

export const filters: ColumnFilter[] = [
  {
    key: "session_id",
    name: "ID",
    dataType: "string",
  },
  {
    key: "trace_id",
    name: "Trace ID",
    dataType: "string",
  },
  {
    key: "duration",
    name: "Duration",
    dataType: "number",
  },
  {
    key: "input_cost",
    name: "Input cost",
    dataType: "number",
  },
  {
    key: "output_cost",
    name: "Output cost",
    dataType: "number",
  },
  {
    key: "cost",
    name: "Total cost",
    dataType: "number",
  },
  {
    key: "input_token_count",
    name: "Input tokens",
    dataType: "number",
  },
  {
    key: "output_token_count",
    name: "Output tokens",
    dataType: "number",
  },
  {
    key: "total_token_count",
    name: "Total tokens",
    dataType: "number",
  },
  {
    key: "trace_count",
    name: "Trace count",
    dataType: "number",
  },
  {
    key: "metadata",
    name: "Metadata",
    dataType: "json",
  },
  {
    key: "tags",
    name: "Tags",
    dataType: "string",
  },
  {
    key: "user_id",
    name: "User ID",
    dataType: "string",
  },
];
