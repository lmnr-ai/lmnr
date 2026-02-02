import { type ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import Mono from "@/components/ui/mono.tsx";

export interface SignalJobRow {
  id: string;
  eventDefinitionId: string;
  projectId: string;
  totalTraces: number;
  processedTraces: number;
  failedTraces: number;
  createdAt: string;
  updatedAt: string;
}

export const signalJobsColumns: ColumnDef<SignalJobRow, any>[] = [
  {
    accessorFn: (row) => row.id,
    header: "Job ID",
    id: "id",
    cell: (row) => <Mono>{String(row.getValue())}</Mono>,
    size: 120,
  },
  {
    accessorFn: (row) => row.processedTraces / row.totalTraces,
    header: "Progress",
    id: "progress",
    cell: ({ row }) => {
      const total = row.original.totalTraces;
      const succeeded = row.original.processedTraces;
      const failed = row.original.failedTraces;
      const pending = total - succeeded - failed;

      return (
        <div className="flex items-center gap-3 font-medium tabular-nums">
          <span className="flex items-center gap-1">
            <Clock3 size={14} className="text-muted-foreground" />
            {pending.toLocaleString()}
          </span>
          {succeeded > 0 && (
            <span className="flex items-center gap-1">
              <CheckCircle2 size={14} className="text-success" />
              {succeeded.toLocaleString()}
            </span>
          )}
          {failed > 0 && (
            <span className="flex items-center gap-1">
              <XCircle size={14} className="text-destructive" />
              {failed.toLocaleString()}
            </span>
          )}
        </div>
      );
    },
    size: 220,
  },
  {
    accessorFn: (row) => row.createdAt,
    header: "Created",
    cell: (row) => <ClientTimestampFormatter absolute timestamp={String(row.getValue())} />,
    id: "created_at",
    size: 150,
  },
  {
    accessorFn: (row) => row.updatedAt,
    header: "Updated",
    cell: (row) => <ClientTimestampFormatter absolute timestamp={String(row.getValue())} />,
    id: "updated_at",
    size: 150,
  },
];

export const signalJobsFilters: ColumnFilter[] = [
  {
    name: "Job ID",
    key: "job_id",
    dataType: "string",
  },
];
