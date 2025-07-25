"use client";
import { ColumnDef, Row } from "@tanstack/react-table";
import { ArrowRight, Check, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import SpanTypeIcon from "@/components/traces/span-type-icon";
import { DataTable } from "@/components/ui/datatable";
import Mono from "@/components/ui/mono";
import { useToast } from "@/lib/hooks/use-toast";
import { Trace } from "@/lib/traces/types";
import { PaginatedResponse } from "@/lib/types";

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

interface PlaygroundHistoryTableProps {
  playgroundId: string;
  onRowClick?: (trace: Trace) => void;
  onTraceSelect?: (traceId: string) => void;
}

const fetchTraces = async (url: string): Promise<PaginatedResponse<Trace>> => {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch traces: ${res.status} ${res.statusText}`);
  }

  return res.json();
};

export default function PlaygroundHistoryTable({
  playgroundId,
  onRowClick,
  onTraceSelect,
}: PlaygroundHistoryTableProps) {
  const { projectId } = useParams();
  const { toast } = useToast();

  const [pageNumber, setPageNumber] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const swrKey = useMemo(() => {
    if (!projectId || !playgroundId) return null;

    const urlParams = new URLSearchParams();
    urlParams.set("pageNumber", pageNumber.toString());
    urlParams.set("pageSize", pageSize.toString());
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

    return `/api/projects/${projectId}/traces?${urlParams.toString()}`;
  }, [projectId, playgroundId, pageNumber, pageSize]);

  const { data } = useSWR(swrKey, fetchTraces, {
    onError: (_) => {
      toast({
        title: "Failed to load playground history. Please try again.",
        variant: "destructive",
      });
    },
  });

  const traces = data?.items;
  const totalCount = data?.totalCount ?? 0;
  const pageCount = useMemo(() => Math.ceil(totalCount / pageSize), [totalCount, pageSize]);

  const handleRowClick = useCallback(
    (row: Row<Trace>) => {
      onRowClick?.(row.original);
      onTraceSelect?.(row.original.id);
    },
    [onRowClick, onTraceSelect]
  );

  const onPageChange = useCallback((newPageNumber: number, newPageSize: number) => {
    setPageNumber(newPageNumber);
    setPageSize(newPageSize);
  }, []);

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
