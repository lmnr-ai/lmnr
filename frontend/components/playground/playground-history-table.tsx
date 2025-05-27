"use client";
import { ColumnDef, Row } from "@tanstack/react-table";
import { ArrowRight, CircleCheck, CircleX } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { DataTable } from "@/components/ui/datatable";
import Mono from "@/components/ui/mono";
import { useToast } from "@/lib/hooks/use-toast";
import { Trace } from "@/lib/traces/types";
import { PaginatedResponse } from "@/lib/types";

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
          <CircleX className="self-center text-red-500" size={20} />
        ) : (
          <CircleCheck className="text-green-500/80" size={20} />
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
          {row.row.original.topSpanName && (
            <SpanTypeIcon className="z-10" spanType={row.getValue()} />
          )}
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
      <div className="text-ellipsis overflow-hidden whitespace-nowrap max-w-[200px]">
        {row.getValue()}
      </div>
    ),
    accessorKey: "topSpanInputPreview",
    header: "Input",
    id: "input",
    size: 200,
  },
  {
    cell: (row) => (
      <div className="text-ellipsis overflow-hidden whitespace-nowrap max-w-[200px]">
        {row.getValue()}
      </div>
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

interface PlaygroundHistoryTableProps {
  playgroundId: string;
  onRowClick?: (trace: Trace) => void;
  onTraceSelect?: (traceId: string) => void;
  refreshTrigger?: number;
}

export default function PlaygroundHistoryTable({
  playgroundId,
  onRowClick,
  onTraceSelect,
  refreshTrigger
}: PlaygroundHistoryTableProps) {
  const { projectId } = useParams();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [traces, setTraces] = useState<Trace[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const pageCount = useMemo(() => Math.ceil(totalCount / pageSize), [totalCount, pageSize]);

  const getTraces = useCallback(async () => {
    try {
      setTraces(undefined);
      const urlParams = new URLSearchParams();
      urlParams.set("pageNumber", pageNumber.toString());
      urlParams.set("pageSize", pageSize.toString());
      urlParams.set("pastHours", "168"); // Last week

      // Filter by playground metadata using the correct format for JSON data type
      urlParams.append("filter", JSON.stringify({
        column: "metadata",
        operator: "eq",
        value: `playgroundId=${playgroundId}`
      }));

      const url = `/api/projects/${projectId}/traces?${urlParams.toString()}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch traces: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as PaginatedResponse<Trace>;
      setTraces(data.items);
      setTotalCount(data.totalCount);
    } catch (error) {
      toast({
        title: "Failed to load playground history. Please try again.",
        variant: "destructive",
      });
      setTraces([]);
      setTotalCount(0);
    }
  }, [pageNumber, pageSize, playgroundId, projectId, toast]);

  useEffect(() => {
    getTraces();
  }, [getTraces]);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      getTraces();
    }
  }, [refreshTrigger, getTraces]);

  const handleRowClick = useCallback(
    (row: Row<Trace>) => {
      onRowClick?.(row.original);
      onTraceSelect?.(row.original.id);
    },
    [onRowClick, onTraceSelect]
  );

  const onPageChange = useCallback(
    (newPageNumber: number, newPageSize: number) => {
      setPageNumber(newPageNumber);
      setPageSize(newPageSize);
    },
    []
  );

  return (
    <DataTable
      className="border-none w-full"
      columns={columns}
      data={traces}
      getRowId={(trace) => trace.id}
      onRowClick={handleRowClick}
      paginated
      manualPagination
      pageCount={pageCount}
      defaultPageSize={pageSize}
      defaultPageNumber={pageNumber}
      onPageChange={onPageChange}
      totalItemsCount={totalCount}
      enableRowSelection={false}
    />
  );
} 