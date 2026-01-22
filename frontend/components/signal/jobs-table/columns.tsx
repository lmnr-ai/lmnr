import { TooltipPortal } from "@radix-ui/react-tooltip";
import { type ColumnDef } from "@tanstack/react-table";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  style: "percent",
});

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
      const percentage = total > 0 ? (succeeded + failed) / total : 0;

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2.5 cursor-default w-full">
                <Progress value={percentage * 100} className="h-2 flex-1 w-32" />
                <span className="text-xs font-semibold text-foreground shrink-0 text-right tabular-nums">
                  {numberFormatter.format(percentage)}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent side="bottom" className="text-xs">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-medium tabular-nums">{total.toLocaleString()}</span>
                  </div>
                  <div className="h-px bg-border my-0.5" />
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Succeeded:</span>
                    <span className="font-medium tabular-nums text-success">{succeeded.toLocaleString()}</span>
                  </div>
                  {failed > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Failed:</span>
                      <span className="font-medium tabular-nums text-destructive">{failed.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>
        </TooltipProvider>
      );
    },
    size: 220,
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
