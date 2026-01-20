import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { Progress } from "@/components/ui/progress";
import { TIME_SECONDS_FORMAT } from "@/lib/utils.ts";

export interface TraceAnalysisJobRow {
  id: string;
  eventDefinitionId: string;
  projectId: string;
  totalTraces: number;
  processedTraces: number;
  failedTraces: number;
  createdAt: string;
  updatedAt: string;
}

export const getTraceAnalysisJobColumns = (): ColumnDef<TraceAnalysisJobRow, any>[] => [
  {
    accessorFn: (row) => row.id,
    header: "Job ID",
    id: "id",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.original.id.slice(0, 8)}...</span>
    ),
    size: 120,
  },
  {
    accessorFn: (row) => row.totalTraces,
    header: "Total Traces",
    id: "total_traces",
    cell: ({ row }) => <span className="text-secondary-foreground">{row.original.totalTraces.toLocaleString()}</span>,
    size: 120,
  },
  {
    accessorFn: (row) => row.processedTraces,
    header: "Processed",
    id: "processed_traces",
    cell: ({ row }) => (
      <span className="text-secondary-foreground">{row.original.processedTraces.toLocaleString()}</span>
    ),
    size: 110,
  },
  {
    accessorFn: (row) => row.failedTraces,
    header: "Failed",
    id: "failed_traces",
    cell: ({ row }) => (
      <span className={row.original.failedTraces > 0 ? "text-destructive" : "text-muted-foreground"}>
        {row.original.failedTraces.toLocaleString()}
      </span>
    ),
    size: 90,
  },
  {
    accessorFn: (row) => row.processedTraces / row.totalTraces,
    header: "Progress",
    id: "progress",
    cell: ({ row }) => {
      const total = row.original.totalTraces;
      const processed = row.original.processedTraces;
      const percentage = total > 0 ? (processed / total) * 100 : 0;
      const isComplete = processed >= total;

      return (
        <div className="flex items-center gap-2 min-w-[150px]">
          <Progress value={percentage} className="h-2 flex-1" />
          <span className="text-xs text-muted-foreground shrink-0 w-12 text-right">
            {isComplete ? "Done" : `${percentage.toFixed(0)}%`}
          </span>
        </div>
      );
    },
    size: 200,
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
