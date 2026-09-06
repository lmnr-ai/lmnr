import { type ColumnDef } from "@tanstack/react-table";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { NIL_EVENT_ID } from "@/components/signal/runs-table/constants";
import CopyTooltip from "@/components/ui/copy-tooltip.tsx";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono";
import { SIGNAL_RUN_STATUSES, type SignalRunRow } from "@/lib/actions/signal-runs/types";

import { ClusterCell } from "./cluster-cell";
import { EventCell } from "./event-cell";
import { SIGNAL_RUN_STATUS_LABELS, StatusCell } from "./status-cell";

// Cost is priced server-side (see `getSignalRuns`); the cell only renders the precomputed micro-USD value as USD.
const formatRunCost = (row: SignalRunRow): string =>
  `$${(row.costMicroUsd / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;

export const getSignalRunsColumns = (): ColumnDef<SignalRunRow>[] => [
  {
    accessorKey: "runId",
    cell: (row) => (
      <CopyTooltip value={String(row.getValue())} className="block truncate">
        <Mono>{String(row.getValue())}</Mono>
      </CopyTooltip>
    ),
    header: "Run ID",
    size: 96,
    id: "runId",
  },
  {
    accessorKey: "traceId",
    cell: (row) => (
      <CopyTooltip value={String(row.getValue())} className="block truncate">
        <Mono>{String(row.getValue())}</Mono>
      </CopyTooltip>
    ),
    header: "Trace ID",
    size: 96,
    id: "traceId",
  },
  {
    accessorKey: "eventId",
    cell: (row) => (
      <CopyTooltip value={String(row.getValue())} className="block truncate">
        <Mono>{String(row.getValue()) === NIL_EVENT_ID ? "-" : String(row.getValue())}</Mono>
      </CopyTooltip>
    ),
    header: "Event ID",
    size: 96,
    id: "eventId",
  },
  {
    cell: (row) => <span className="text-xs">{row.row.original.jobId !== NIL_EVENT_ID ? "Backfill" : "Trigger"}</span>,
    header: "Source",
    size: 96,
    id: "source",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: (row) => <StatusCell status={row.row.original.status} />,
    size: 120,
    id: "status",
  },
  {
    header: "Event",
    cell: (row) => <EventCell row={row.row.original} />,
    size: 120,
    id: "event",
  },
  {
    header: "Clusters",
    cell: (row) => <ClusterCell clusters={row.row.original.clusters} />,
    size: 360,
    id: "cluster",
  },
  {
    header: "Cost",
    cell: (row) => <Mono>{formatRunCost(row.row.original)}</Mono>,
    size: 116,
    id: "cost",
  },
  {
    accessorKey: "updatedAt",
    header: "Updated At",
    cell: (row) => <ClientTimestampFormatter absolute timestamp={String(row.getValue())} />,
    size: 128,
    id: "updatedAt",
  },
];

export const defaultRunsColumnOrder = [
  "status",
  "source",
  "event",
  "cluster",
  "cost",
  "updatedAt",
  "traceId",
  "eventId",
  "runId",
];

export const defaultRunsColumnVisibility: Record<string, boolean> = {
  traceId: false,
  runId: false,
};

export const signalRunsFilters: ColumnFilter[] = [
  {
    name: "Status",
    key: "status",
    dataType: "enum",
    options: SIGNAL_RUN_STATUSES.filter((value) => value !== "UNKNOWN").map((value) => ({
      value,
      label: SIGNAL_RUN_STATUS_LABELS[value],
    })),
  },
  {
    name: "Has event",
    key: "has_event",
    dataType: "enum",
    options: [
      { value: "event", label: "Yes" },
      { value: "no_event", label: "No" },
    ],
  },
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
];
