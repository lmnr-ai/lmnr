import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { TIME_SECONDS_FORMAT } from "@/lib/utils.ts";

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
    cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.id}</span>,
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

      return (
        <div className="flex items-center gap-1 text-xs font-medium tabular-nums">
          <span className="text-success">{succeeded.toLocaleString()}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground">{total.toLocaleString()}</span>
          {failed > 0 && (
            <>
              <span className="text-muted-foreground">(</span>
              <span className="text-destructive">{failed.toLocaleString()}</span>
              <span className="text-destructive">failed</span>
              <span className="text-muted-foreground">)</span>
            </>
          )}
        </div>
      );
    },
    size: 180,
  },
  {
    accessorFn: (row) => row.createdAt,
    header: "Created",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} format={TIME_SECONDS_FORMAT} />,
    id: "created_at",
    size: 150,
  },
  {
    accessorFn: (row) => row.updatedAt,
    header: "Updated",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} format={TIME_SECONDS_FORMAT} />,
    id: "updated_at",
    size: 150,
  },
];
