import { TooltipPortal } from "@radix-ui/react-tooltip";
import { type ColumnDef, type Row } from "@tanstack/react-table";
import { capitalize } from "lodash";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Badge } from "@/components/ui/badge.tsx";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type SignalRunRow } from "@/lib/actions/signal-runs";

export const getSignalRunsColumns = ({
  onJobNav,
  onTriggerNav,
}: {
  onJobNav: (row: Row<SignalRunRow>) => void;
  onTriggerNav: (row: Row<SignalRunRow>) => void;
}): ColumnDef<SignalRunRow>[] => [
  {
    accessorKey: "runId",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "Run ID",
    size: 120,
    id: "runId",
  },
  {
    accessorKey: "traceId",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "Trace ID",
    size: 120,
    id: "traceId",
  },
  {
    accessorKey: "eventId",
    cell: (row) => (
      <Mono>{String(row.getValue()) === "00000000-0000-0000-0000-000000000000" ? "-" : String(row.getValue())}</Mono>
    ),
    header: "Event ID",
    size: 120,
    id: "eventId",
  },
  {
    cell: (row) => {
      if (row.row.original.jobId !== "00000000-0000-0000-0000-000000000000") {
        return (
          <Badge
            onClick={() => onJobNav(row.row)}
            className="rounded-3xl mr-1 hover:underline cursor-pointer"
            variant="outline"
          >
            Job
          </Badge>
        );
      }

      return (
        <Badge
          onClick={() => onTriggerNav(row.row)}
          className="rounded-3xl mr-1 hover:underline cursor-pointer"
          variant="outline"
        >
          Trigger
        </Badge>
      );
    },
    header: "Source",
    size: 120,
    id: "source",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: (row) => (
      <Badge className="rounded-3xl mr-1" variant="outline">
        {capitalize(row.row.original.status)}
      </Badge>
    ),
    size: 120,
    id: "status",
  },
  {
    accessorKey: "errorMessage",
    header: "Error Message",
    cell: ({ getValue, column }) => {
      const value = getValue() as string | null;
      if (!value) return <span className="text-muted-foreground">-</span>;

      return (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div style={{ width: column.getSize() - 32 }} className="truncate">
                {value}
              </div>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent className="p-0 max-w-md border text-secondary-foreground whitespace-pre-wrap break-words">
                <ScrollArea>
                  <div className="max-h-64 min-h-8 p-2">{value}</div>
                </ScrollArea>
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>
        </TooltipProvider>
      );
    },
    size: 300,
    id: "errorMessage",
  },
  {
    accessorKey: "updatedAt",
    header: "Updated At",
    cell: (row) => <ClientTimestampFormatter absolute timestamp={String(row.getValue())} />,
    size: 150,
    id: "updatedAt",
  },
];

export const defaultRunsColumnOrder = ["runId", "traceId", "eventId", "source", "status", "errorMessage", "updatedAt"];

export const signalRunsFilters: ColumnFilter[] = [
  {
    name: "Job ID",
    key: "job_id",
    dataType: "string",
  },
  {
    name: "Run ID",
    key: "run_id",
    dataType: "string",
  },
  {
    name: "Trace ID",
    key: "trace_id",
    dataType: "string",
  },
  {
    name: "Trigger ID",
    key: "trigger_id",
    dataType: "string",
  },
  {
    name: "Event ID",
    key: "event_id",
    dataType: "string",
  },
  {
    name: "Status",
    key: "status",
    dataType: "enum",
    options: ["PENDING", "COMPLETED", "FAILED"].map((value) => ({ value, label: capitalize(value) })),
  },
  {
    name: "Error Message",
    key: "error_message",
    dataType: "string",
  },
];
