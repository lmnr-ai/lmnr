import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { type ColumnDef } from "@tanstack/react-table";
import { Check } from "lucide-react";
import React from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import SignalSparkline from "@/components/signals/signal-sparkline.tsx";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type SignalRow } from "@/lib/actions/signals";

export const signalsTableFilters: ColumnFilter[] = [
  {
    name: "Name",
    key: "name",
    dataType: "string",
  },
];

export type SparklineScale = "day" | "week" | "month";

export interface SignalTableMeta {
  sparklineData?: Record<string, { timestamp: string; count: number }[]>;
  sparklineScale?: SparklineScale;
  sparklineMaxCount?: number;
  onScaleChange?: (scale: SparklineScale) => void;
}

export const signalsColumns: ColumnDef<SignalRow>[] = [
  {
    header: "Name",
    accessorFn: (row) => row.name,
    cell: ({ row }) => (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate">{row.original.name}</span>
          </TooltipTrigger>
          {row.original.prompt && (
            <TooltipPrimitive.Portal>
              <TooltipContent side="bottom" align="start" className="max-w-[350px]">
                <p className="text-muted-foreground whitespace-pre-wrap">{row.original.prompt}</p>
              </TooltipContent>
            </TooltipPrimitive.Portal>
          )}
        </Tooltip>
      </TooltipProvider>
    ),
    id: "name",
    size: 240,
  },
  {
    header: "Events",
    id: "eventsCount",
    accessorFn: (row) => row.eventsCount,
    cell: ({ row }) => <span className="truncate">{row.original.eventsCount}</span>,
    size: 88,
  },
  {
    header: "Last Event",
    id: "lastEventAt",
    accessorFn: (row) => row.lastEventAt,
    cell: ({ row }) => {
      if (!row.original.lastEventAt) {
        return <span className="text-muted-foreground">-</span>;
      }
      return <ClientTimestampFormatter timestamp={row.original.lastEventAt} />;
    },
    size: 105,
  },
  {
    header: ({ table }) => {
      const meta = table.options.meta as SignalTableMeta | undefined;
      const scale = meta?.sparklineScale ?? "week";
      return (
        <span>
          Activity <span className="text-muted-foreground">({scale})</span>
        </span>
      );
    },
    id: "sparkline",
    enableSorting: true,
    sortingFn: (rowA, rowB, columnId) =>
      // Custom sorting that triggers scale change via the dropdown
      0,
    meta: {
      customDropdownItems: (table: unknown) => {
        const meta = (table as { options: { meta: SignalTableMeta } }).options.meta;
        const scale = meta?.sparklineScale ?? "day";
        const onChange = meta?.onScaleChange;
        return (["day", "week", "month"] as const).map((s) => ({
          label: s.charAt(0).toUpperCase() + s.slice(1),
          icon: scale === s ? <Check className="size-3.5 text-primary-foreground" /> : undefined,
          isActive: scale === s,
          onClick: () => onChange?.(s),
        }));
      },
    },
    cell: ({ row, table }) => {
      const meta = table.options.meta as SignalTableMeta | undefined;
      const data = meta?.sparklineData?.[row.original.id] ?? [];
      const maxCount = meta?.sparklineMaxCount;
      return <SignalSparkline data={data} maxCount={maxCount} />;
    },
    size: 500,
  },
  {
    header: "Triggers",
    id: "triggersCount",
    accessorFn: (row) => row.triggersCount,
    cell: ({ row }) => <span className="truncate">{row.original.triggersCount}</span>,
    size: 100,
  },
  {
    header: "Created",
    accessorFn: (row) => row.createdAt,
    cell: ({ row }) => <ClientTimestampFormatter absolute timestamp={row.original.createdAt} />,
    id: "createdAt",
    size: 150,
  },
];

export const defaultSignalsColumnsOrder = [
  "__row_selection",
  "name",
  "eventsCount",
  "lastEventAt",
  "triggersCount",
  "createdAt",
  "sparkline",
];
