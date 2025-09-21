"use client";
import { Row } from "@tanstack/react-table";
import { isEmpty, map } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import RefreshButton from "@/components/traces/refresh-button";
import SearchTracesInput from "@/components/traces/search-traces-input";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import { columns, filters } from "@/components/traces/traces-table/columns";
import { mapPendingTraceFromRealTime } from "@/components/traces/traces-table/utils.ts";
import DeleteSelectedRows from "@/components/ui/DeleteSelectedRows";
import { useUserContext } from "@/contexts/user-context";
import { useToast } from "@/lib/hooks/use-toast";
import { RealtimeTracePayload, SpanType, TraceRow } from "@/lib/traces/types";

import { DataTable } from "../../ui/datatable";
import DataTableFilter, { DataTableFilterList } from "../../ui/datatable-filter";
import DateRangeFilter from "../../ui/date-range-filter";

export default function TracesTable() {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { projectId } = useParams();
  const { toast } = useToast();

  const { traceId, setTraceId: onRowClick } = useTracesStoreContext((state) => ({
    traceId: state.traceId,
    setTraceId: state.setTraceId,
  }));

  const pageNumber = searchParams.get("pageNumber") ? parseInt(searchParams.get("pageNumber")!) : 0;
  const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!) : 50;
  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const textSearchFilter = searchParams.get("search");
  const searchIn = searchParams.getAll("searchIn");

  const [traces, setTraces] = useState<TraceRow[] | undefined>(undefined);
  const { setNavigationRefList } = useTraceViewNavigation();
  const [totalCount, setTotalCount] = useState<number>(0); // including the filtering

  const pageCount = useMemo(() => Math.ceil(totalCount / pageSize), [totalCount, pageSize]);

  const isCurrentTimestampIncluded = !!pastHours || (!!endDate && new Date(endDate) >= new Date());

  const tracesRef = useRef<TraceRow[] | undefined>(traces);

  useEffect(() => {
    setNavigationRefList(map(traces, "id"));
  }, [setNavigationRefList, traces]);

  // Keep ref updated
  useEffect(() => {
    tracesRef.current = traces;
  }, [traces]);

  const getTraces = useCallback(async () => {
    try {
      setTraces(undefined);
      const urlParams = new URLSearchParams();
      urlParams.set("pageNumber", pageNumber.toString());
      urlParams.set("pageSize", pageSize.toString());

      if (pastHours != null) urlParams.set("pastHours", pastHours);
      if (startDate != null) urlParams.set("startDate", startDate);
      if (endDate != null) urlParams.set("endDate", endDate);

      filter.forEach((filter) => urlParams.append("filter", filter));

      if (typeof textSearchFilter === "string" && textSearchFilter.length > 0) {
        urlParams.set("search", textSearchFilter);
      }

      if (isEmpty(searchIn) || searchIn?.length === 2) {
        urlParams.append("searchIn", "input");
        urlParams.append("searchIn", "output");
      } else if (searchIn?.length > 0) {
        urlParams.set("searchIn", searchIn[0]);
      }

      const url = `/api/projects/${projectId}/traces?${urlParams.toString()}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const text = (await res.json()) as { error: string };
        throw new Error(text.error);
      }

      const data = (await res.json()) as { items: TraceRow[]; count: number };
      setTraces(data.items);
      setTotalCount(data.count);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load traces. Please try again.",
        variant: "destructive",
      });
      setTraces([]);
      setTotalCount(0);
    }
  }, [
    endDate,
    JSON.stringify(filter),
    pageNumber,
    pageSize,
    pastHours,
    pathName,
    projectId,
    router,
    searchIn,
    startDate,
    textSearchFilter,
    toast,
  ]);

  const updateRealtimeTracesFromSpan = useCallback(
    async (spanData: Record<string, any>) => {
      const currentTraces = tracesRef.current;
      if (!currentTraces) return;

      const traceId = spanData.traceId;
      if (!traceId) return;

      // Find existing trace
      const existingTraceIndex = currentTraces.findIndex((trace) => trace.id === traceId);

      const isTopSpan = spanData.parentSpanId === null;

      if (existingTraceIndex !== -1) {
        // Update existing trace
        const newTraces = [...currentTraces];
        const existingTrace = newTraces[existingTraceIndex];

        // Update trace metrics from span data
        const spanInputTokens = spanData.attributes?.["gen_ai.usage.input_tokens"] || 0;
        const spanOutputTokens = spanData.attributes?.["gen_ai.usage.output_tokens"] || 0;
        const spanInputCost = spanData.attributes?.["gen_ai.usage.input_cost"] || 0;
        const spanOutputCost = spanData.attributes?.["gen_ai.usage.output_cost"] || 0;

        newTraces[existingTraceIndex] = {
          ...existingTrace,
          endTime: new Date(Math.max(
            new Date(existingTrace.endTime).getTime(),
            new Date(spanData.endTime).getTime()
          )).toUTCString(),
          totalTokens: existingTrace.totalTokens + spanInputTokens + spanOutputTokens,
          inputTokens: existingTrace.inputTokens + spanInputTokens,
          outputTokens: existingTrace.outputTokens + spanOutputTokens,
          inputCost: existingTrace.inputCost + spanInputCost,
          outputCost: existingTrace.outputCost + spanOutputCost,
          totalCost: existingTrace.totalCost + spanInputCost + spanOutputCost,
          topSpanName: isTopSpan ? spanData.name : null,
          topSpanId: isTopSpan ? spanData.spanId : null,
          topSpanType: isTopSpan ? spanData.spanType : null,
        };

        setTraces(newTraces);
      } else {
        const newTrace: TraceRow = {
          id: traceId,
          startTime: spanData.startTime,
          endTime: spanData.endTime,
          sessionId: spanData.attributes?.["session.id"] || null,
          inputTokens: spanData.attributes?.["gen_ai.usage.input_tokens"] || 0,
          outputTokens: spanData.attributes?.["gen_ai.usage.output_tokens"] || 0,
          totalTokens: (spanData.attributes?.["gen_ai.usage.input_tokens"] || 0) + (spanData.attributes?.["gen_ai.usage.output_tokens"] || 0),
          inputCost: spanData.attributes?.["gen_ai.usage.input_cost"] || 0,
          outputCost: spanData.attributes?.["gen_ai.usage.output_cost"] || 0,
          totalCost: (spanData.attributes?.["gen_ai.usage.input_cost"] || 0) + (spanData.attributes?.["gen_ai.usage.output_cost"] || 0),
          metadata: spanData.attributes?.["metadata"] || null,
          topSpanId: isTopSpan ? spanData.spanId : null,
          traceType: "DEFAULT",
          topSpanName: isTopSpan ? spanData.name : null,
          topSpanType: isTopSpan ? spanData.spanType : null,
          status: spanData.status,
          userId: spanData.attributes?.["user.id"] || null,
          tags: spanData.attributes?.["tags"] || [],
        };

        const newTraces = currentTraces ? [...currentTraces] : [];
        const insertIndex = newTraces.findIndex((trace) => trace.startTime <= newTrace.startTime);
        newTraces.splice(Math.max(insertIndex ?? 0, 0), 0, newTrace);

        if (newTraces.length > pageSize) {
          newTraces.splice(pageSize);
        }

        setTraces(newTraces);
        setTotalCount((prev) => prev + 1);
      }
    },
    [pageSize]
  );

  // SSE connection for realtime updates
  useEffect(() => {
    if (filter.length > 0 || !!textSearchFilter) {
      return;
    }

    if (!isCurrentTimestampIncluded) {
      return;
    }

    const eventSource = new EventSource(`/api/projects/${projectId}/realtime`);

    eventSource.addEventListener("new_spans", async (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.spans && Array.isArray(payload.spans)) {
          for (const span of payload.spans) {
            if (span.traceId) {
              await updateRealtimeTracesFromSpan(span);
            }
          }
        }
      } catch (error) {
        console.error("Error processing SSE message:", error);
      }
    });

    eventSource.addEventListener("error", (error) => {
      console.error("SSE connection error:", error);
    });

    // Clean up on unmount
    return () => {
      eventSource.close();
    };
  }, [projectId, isCurrentTimestampIncluded, filter.length, textSearchFilter, updateRealtimeTracesFromSpan]);

  useEffect(() => {
    if (pastHours || startDate || endDate) {
      getTraces();
    } else {
      // Set default parameters only once without triggering getTraces again
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("pastHours", "24");
      router.replace(`${pathName}?${sp.toString()}`);
    }
  }, [
    projectId,
    pageNumber,
    pageSize,
    pastHours,
    startDate,
    endDate,
    textSearchFilter,
    JSON.stringify(filter),
    JSON.stringify(searchIn),
  ]);

  const handleDeleteTraces = async (traceIds: string[]) => {
    try {
      const params = new URLSearchParams(traceIds.map((id) => ["traceId", id]));
      const response = await fetch(`/api/projects/${projectId}/traces?${params.toString()}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        toast({
          title: "Failed to delete traces. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Traces deleted",
          description: `Successfully deleted ${traceIds.length} trace(s).`,
        });

        setTraces((prev) => {
          if (prev) {
            return prev.filter((t) => !traceIds.includes(t.id));
          }
          return prev;
        });
        setTotalCount((prev) => Math.max(prev - traceIds.length, 0));
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to delete traces. Please try again.",
      });
    }
  };

  const handleRowClick = useCallback(
    (row: Row<TraceRow>) => {
      onRowClick?.(row.id);
      const params = new URLSearchParams(searchParams);
      params.set("traceId", row.id);
      params.delete("spanId");
      router.push(`${pathName}?${params.toString()}`);
    },
    [onRowClick, pathName, router, searchParams]
  );

  const onPageChange = useCallback(
    (pageNumber: number, pageSize: number) => {
      const params = new URLSearchParams(searchParams);
      params.set("pageNumber", pageNumber.toString());
      params.set("pageSize", pageSize.toString());
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );

  return (
    <DataTable
      className="border-none w-full"
      columns={columns}
      data={traces}
      getRowId={(trace) => trace.id}
      onRowClick={handleRowClick}
      paginated
      focusedRowId={traceId || searchParams.get("traceId")}
      manualPagination
      pageCount={pageCount}
      defaultPageSize={pageSize}
      defaultPageNumber={pageNumber}
      onPageChange={onPageChange}
      totalItemsCount={totalCount}
      enableRowSelection
      childrenClassName="flex flex-col gap-2 py-2 items-start h-fit space-x-0"
      selectionPanel={(selectedRowIds) => (
        <div className="flex flex-col space-y-2">
          <DeleteSelectedRows selectedRowIds={selectedRowIds} onDelete={handleDeleteTraces} entityName="traces" />
        </div>
      )}
    >
      <div className="flex flex-1 w-full space-x-2">
        <DataTableFilter columns={filters} />
        <DateRangeFilter />
        <RefreshButton iconClassName="w-3.5 h-3.5" onClick={getTraces} variant="outline" className="text-xs" />
        <SearchTracesInput />
      </div>
      <DataTableFilterList />
    </DataTable>
  );
}
