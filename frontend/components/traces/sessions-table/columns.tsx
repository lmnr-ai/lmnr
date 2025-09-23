import { ChevronDownIcon } from "@radix-ui/react-icons";
import { ColumnDef } from "@tanstack/react-table";
import { ChevronRightIcon } from "lucide-react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Badge } from "@/components/ui/badge.tsx";
import { ColumnFilter } from "@/components/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { SessionRow } from "@/lib/traces/types";
import { getDurationString, TIME_SECONDS_FORMAT } from "@/lib/utils";

const format = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 5,
  minimumFractionDigits: 1,
});

export const filters: ColumnFilter[] = [
  {
    key: "session_id",
    name: "Session ID",
    dataType: "string",
  },
  {
    key: "user_id",
    name: "User ID",
    dataType: "string",
  },
  {
    key: "trace_count",
    name: "Trace Count",
    dataType: "number",
  },
  {
    key: "duration",
    name: "Duration",
    dataType: "number",
  },
  {
    key: "total_tokens",
    name: "Total Tokens",
    dataType: "number",
  },
  {
    key: "input_tokens",
    name: "Input Tokens",
    dataType: "number",
  },
  {
    key: "output_tokens",
    name: "Output Tokens",
    dataType: "number",
  },
  {
    key: "total_cost",
    name: "Total Cost",
    dataType: "number",
  },
  {
    key: "input_cost",
    name: "Input Cost",
    dataType: "number",
  },
  {
    key: "output_cost",
    name: "Output Cost",
    dataType: "number",
  },
  {
    key: "tags",
    name: "Tags",
    dataType: "string",
  },
];

export const columns: ColumnDef<SessionRow, any>[] = [
  {
    header: "Type",
    cell: ({ row }) =>
      row.original?.subRows ? (
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
    accessorFn: (row) => row.id || row.sessionId,
    header: "ID",
    id: "id",
    cell: (row) => <Mono className="text-xs">{row.getValue()}</Mono>,
  },
  {
    accessorFn: (row) => row.startTime,
    header: "Start time",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} format={TIME_SECONDS_FORMAT} />,
    id: "start_time",
    size: 150,
  },
  {
    accessorFn: (row) => {
      if (!row?.subRows) {
        return getDurationString(row.startTime, row.endTime);
      }

      return row.duration.toFixed(3) + "s";
    },
    header: "Duration",
    size: 100,
  },
  {
    accessorFn: (row) => format.format(row.inputCost),
    header: "Input cost",
    id: "input_cost",
    size: 120,
  },
  {
    accessorFn: (row) => format.format(row.outputCost),
    header: "Output cost",
    id: "output_cost",
    size: 120,
  },
  {
    accessorFn: (row) => format.format(row.totalCost),
    header: "Total cost",
    id: "total_cost",
    size: 120,
  },
  {
    accessorFn: (row) => row.inputTokens,
    header: "Input tokens",
    id: "input_tokens",
    size: 120,
  },
  {
    accessorFn: (row) => row.outputTokens,
    header: "Output tokens",
    id: "output_tokens",
    size: 120,
  },
  {
    accessorFn: (row) => row.totalTokens,
    header: "Total tokens",
    id: "total_tokens",
    size: 120,
  },
  {
    accessorFn: (row) => (row?.subRows ? row.traceCount || 0 : "-"),
    header: "Trace Count",
    id: "trace_count",
    size: 120,
  },
  {
    accessorFn: (row) => (row?.subRows ? "-" : row.userId),
    header: "User ID",
    id: "user_id",
    cell: (row) => <Mono className="text-xs">{row.getValue() || "-"}</Mono>,
  },
  {
    accessorFn: (row) => ("tags" in row ? row.tags : "-"),
    cell: (row) => {
      const tags = row.getValue() as string[];

      if (Array.isArray(tags) && tags?.length > 0) {
        return (
          <>
            {tags.map((tag) => (
              <Badge key={tag} className="rounded-3xl mr-1" variant="outline">
                <span>{tag}</span>
              </Badge>
            ))}
          </>
        );
      }
      return "-";
    },
    header: "Tags",
    accessorKey: "tags",
    id: "tags",
  },
];
