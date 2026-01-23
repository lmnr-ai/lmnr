import { type ColumnDef } from "@tanstack/react-table";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { type SignalRunRow } from "@/lib/actions/signal-runs";
import { cn, TIME_SECONDS_FORMAT } from "@/lib/utils";

const STATUS_LABELS: Record<number, { label: string; className: string }> = {
  0: { label: "Pending", className: "text-muted-foreground" },
  1: { label: "Running", className: "text-warning" },
  2: { label: "Completed", className: "text-success" },
  3: { label: "Failed", className: "text-destructive" },
};

export const signalRunsColumns: ColumnDef<SignalRunRow>[] = [
  {
    accessorKey: "runId",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "Run ID",
    size: 300,
    id: "runId",
  },
  {
    accessorKey: "jobId",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "Job ID",
    size: 300,
    id: "jobId",
  },
  {
    accessorKey: "triggerId",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "Trigger ID",
    size: 300,
    id: "triggerId",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => {
      const status = getValue() as number;
      const statusInfo = STATUS_LABELS[status] || { label: "Unknown", className: "text-muted-foreground" };
      return <span className={cn("font-medium", statusInfo.className)}>{statusInfo.label}</span>;
    },
    size: 100,
    id: "status",
  },
  {
    accessorKey: "eventId",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "Event ID",
    size: 300,
    id: "eventId",
  },
  {
    accessorKey: "errorMessage",
    header: "Error",
    cell: (row) => {
      const value = row.getValue() as string | undefined;
      return value ? (
        <span className="text-destructive">{value}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
    size: 200,
    id: "errorMessage",
  },
  {
    accessorKey: "updatedAt",
    header: "Updated At",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} format={TIME_SECONDS_FORMAT} />,
    size: 150,
    id: "updatedAt",
  },
];

export const defaultRunsColumnOrder = ["runId", "jobId", "triggerId", "status", "eventId", "errorMessage", "updatedAt"];

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
    dataType: "number",
  },
];
