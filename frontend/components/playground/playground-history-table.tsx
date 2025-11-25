"use client";
import { ColumnDef, Row } from "@tanstack/react-table";
import { ArrowRight, Check, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import ColumnsMenu from "@/components/ui/infinite-datatable/ui/columns-menu.tsx";
import Mono from "@/components/ui/mono";
import { useToast } from "@/lib/hooks/use-toast";
import { Trace } from "@/lib/traces/types";

// ... existing columns definition (unchanged) ...
const renderCost = (val: any) => {
  if (val == null) {
    return "-";
  }
  const parsed = parseFloat(val);
  return isNaN(parsed) ? "-" : `$${parsed.toFixed(5)}`;
};

const columns: ColumnDef<Trace, any>[] = [
  {
    cell: (row) => (
      <div className="flex h-full justify-center items-center w-10">
        {row.getValue() ? (
          <X className="self-center text-destructive" size={18} />
        ) : (
          <Check className="text-success" size={18} />
        )}
      </div>
    ),
    accessorKey: "status",
    header: "Status",
    id: "status",
    size: 70,
  },
  {
    cell: (row) => <Mono className="text-xs">{row.getValue()}</Mono>,
    header: "ID",
    accessorKey: "id",
    id: "id",
    size: 200,
  },
  {
    accessorKey: "topSpanType",
    header: "Type",
    id: "top_span_type",
    cell: (row) => (
      <div className="cursor-pointer flex gap-2 items-center">
        <div className="flex items-center gap-2">
          {row.row.original.topSpanName && <SpanTypeIcon className="z-10" spanType={row.getValue()} />}
        </div>
        {row.row.original.topSpanName && (
          <div className="flex text-sm text-ellipsis overflow-hidden whitespace-nowrap">
            {row.row.original.topSpanName}
          </div>
        )}
      </div>
    ),
    size: 150,
  },
  {
    cell: (row) => (
      <div className="text-ellipsis overflow-hidden whitespace-nowrap max-w-[200px]">{row.getValue()}</div>
    ),
    accessorKey: "topSpanInputPreview",
    header: "Input",
    id: "input",
    size: 200,
  },
  {
    cell: (row) => (
      <div className="text-ellipsis overflow-hidden whitespace-nowrap max-w-[200px]">{row.getValue()}</div>
    ),
    accessorKey: "topSpanOutputPreview",
    header: "Output",
    id: "output",
    size: 200,
  },
  {
    accessorFn: (row) => row.startTime,
    header: "Timestamp",
    cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    id: "start_time",
    size: 125,
  },
  {
    accessorFn: (row) => {
      const start = new Date(row.startTime);
      const end = new Date(row.endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        return "-";
      }
      const duration = end.getTime() - start.getTime();
      return `${(duration / 1000).toFixed(2)}s`;
    },
    header: "Latency",
    id: "latency",
    size: 80,
  },
  {
    accessorFn: (row) => row.cost,
    header: "Cost",
    id: "cost",
    cell: (row) => renderCost(row.getValue()),
    size: 100,
  },
  {
    accessorFn: (row) => row.totalTokenCount ?? "-",
    header: "Tokens",
    id: "total_token_count",
    cell: (row) => (
      <div className="flex items-center text-sm">
        {`${row.row.original.inputTokenCount ?? "-"}`}
        <ArrowRight size={12} className="mx-1 min-w-[12px]" />
        {`${row.row.original.outputTokenCount ?? "-"}`}
        {` (${row.row.original.totalTokenCount ?? "-"})`}
      </div>
    ),
    size: 150,
  },
];

export const defaultPlaygroundHistoryColumnOrder = [
  "status",
  "id",
  "top_span_type",
  "input",
  "output",
  "start_time",
  "latency",
  "cost",
  "total_token_count",
];

interface PlaygroundHistoryTableProps {
  playgroundId: string;
  onRowClick?: (trace: Trace) => void;
  onTraceSelect?: (traceId: string) => void;
}

const FETCH_SIZE = 50;

export default function PlaygroundHistoryTable(props: PlaygroundHistoryTableProps) {
  return (
    <DataTableStateProvider
      storageKey="playground-history-table"
      uniqueKey="id"
      defaultColumnOrder={defaultPlaygroundHistoryColumnOrder}
    >
      <PlaygroundHistoryTableContent {...props} />
    </DataTableStateProvider>
  );
}

function PlaygroundHistoryTableContent({ playgroundId, onRowClick, onTraceSelect }: PlaygroundHistoryTableProps) {
  const { projectId } = useParams();
  const { toast } = useToast();

  const fetchTraces = useCallback(
    async (pageNumber: number) => {
      if (!projectId || !playgroundId) {
        return { items: [], count: 0 };
      }

      try {
        const urlParams = new URLSearchParams();
        urlParams.set("pageNumber", pageNumber.toString());
        urlParams.set("pageSize", FETCH_SIZE.toString());
        urlParams.set("pastHours", "168");
        urlParams.set("traceType", "PLAYGROUND");

        urlParams.append(
          "filter",
          JSON.stringify({
            column: "metadata",
            operator: "eq",
            value: `playgroundId=${playgroundId}`,
          })
        );

        const res = await fetch(`/api/projects/${projectId}/traces?${urlParams.toString()}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch traces: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        return { items: data.items, count: 0 };
      } catch (error) {
        toast({
          title: "Failed to load playground history. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    [projectId, playgroundId, toast]
  );

  const {
    data: traces,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
  } = useInfiniteScroll<Trace>({
    fetchFn: fetchTraces,
    enabled: !!projectId && !!playgroundId,
    deps: [projectId, playgroundId],
  });

  const handleRowClick = useCallback(
    (row: Row<Trace>) => {
      onRowClick?.(row.original);
      onTraceSelect?.(row.original.id);
    },
    [onRowClick, onTraceSelect]
  );

  return (
    <InfiniteDataTable<Trace>
      className="w-full"
      columns={columns}
      data={traces}
      getRowId={(trace) => trace.id}
      onRowClick={handleRowClick}
      hasMore={hasMore}
      isFetching={isFetching}
      isLoading={isLoading}
      fetchNextPage={fetchNextPage}
    >
      <ColumnsMenu
        columnLabels={columns.map((column) => ({
          id: column.id!,
          label: typeof column.header === "string" ? column.header : column.id!,
        }))}
      />
    </InfiniteDataTable>
  );
}
