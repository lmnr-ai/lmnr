import { type ColumnDef } from "@tanstack/react-table";
import { capitalize } from "lodash";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Badge } from "@/components/ui/badge.tsx";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { type SignalRunRow } from "@/lib/actions/signal-runs";
import { TIME_SECONDS_FORMAT } from "@/lib/utils";

export const signalRunsColumns: ColumnDef<SignalRunRow>[] = [
  {
    accessorKey: "runId",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "Run ID",
    size: 300,
    id: "runId",
  },
  {
    accessorKey: "traceId",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    header: "Trace ID",
    size: 300,
    id: "traceId",
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
    cell: (row) => (
      <Mono>{String(row.getValue()) === "00000000-0000-0000-0000-000000000000" ? "-" : String(row.getValue())}</Mono>
    ),
    header: "Trigger ID",
    size: 300,
    id: "triggerId",
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
    accessorKey: "eventId",
    cell: (row) => (
      <Mono>{String(row.getValue()) === "00000000-0000-0000-0000-000000000000" ? "-" : String(row.getValue())}</Mono>
    ),
    header: "Event ID",
    size: 300,
    id: "eventId",
  },
  {
    accessorKey: "updatedAt",
    header: "Updated At",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} format={TIME_SECONDS_FORMAT} />,
    size: 150,
    id: "updatedAt",
  },
];

export const defaultRunsColumnOrder = ["runId", "traceId", "jobId", "triggerId", "status", "eventId", "updatedAt"];

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
];
