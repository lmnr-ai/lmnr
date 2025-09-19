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
        throw new Error(`Failed to fetch traces: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as { items: TraceRow[]; count: number };
      setTraces(data.items);
      setTotalCount(data.count);
    } catch (error) {
      toast({
        title: "Failed to load traces. Please try again.",
        variant: "destructive",
      });
      // Set empty traces to show error state
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

  const getTraceTopSpanInfo = useCallback(
    async (
      spanId: string
    ): Promise<{
      topSpanName?: string;
      topSpanType?: SpanType;
      topSpanInputPreview?: any;
      topSpanOutputPreview?: any;
    }> => {
      try {
        const response = await fetch(`/api/projects/${projectId}/spans/${spanId}/basic-info`);

        if (!response.ok) {
          throw new Error(`Failed to fetch span info: ${response.status} ${response.statusText}`);
        }

        const span = await response.json();
        return {
          topSpanName: span?.name,
          topSpanType: span?.spanType,
          topSpanInputPreview: span?.inputPreview,
          topSpanOutputPreview: span?.outputPreview,
        };
      } catch (error) {
        console.warn("Failed to fetch span info:", error);
        return {};
      }
    },
    [projectId]
  );

  const updateRealtimeTraces = useCallback(
    async (eventType: "INSERT" | "UPDATE", old: Partial<RealtimeTracePayload>, newObj: RealtimeTracePayload) => {
      const currentTraces = tracesRef.current;

      if (eventType === "INSERT") {
        if (!currentTraces) return;

        const rtEventTrace = mapPendingTraceFromRealTime(newObj);

        // Ignore non-default traces (eval traces, etc.)
        if (rtEventTrace.traceType !== "DEFAULT") {
          return;
        }

        // Create a new trace object with span info if available
        let newTrace: TraceRow = { ...rtEventTrace };

        // If we have a topSpanId but no span info yet, fetch it
        if (rtEventTrace.topSpanId && !rtEventTrace.topSpanName) {
          try {
            const spanInfo = await getTraceTopSpanInfo(rtEventTrace.topSpanId);
            newTrace = { ...rtEventTrace, ...spanInfo };
          } catch (error) {
            console.warn("Failed to fetch span info for realtime trace:", error);
          }
        }

        // Find the correct insertion position (maintain chronological order)
        const insertIndex = newObj.start_time
          ? currentTraces.findIndex((trace) => trace.startTime <= newObj.start_time!)
          : 0;
        const newTraces = [...currentTraces];

        newTraces.splice(Math.max(insertIndex === -1 ? 0 : insertIndex, 0), 0, newTrace);

        // Keep only the page size limit
        if (newTraces.length > pageSize) {
          newTraces.splice(pageSize);
        }

        setTraces(newTraces);
        setTotalCount((prev) => prev + 1);
      } else if (eventType === "UPDATE") {
        if (!currentTraces || currentTraces.length === 0) {
          return;
        }

        const updateIndex = currentTraces.findIndex((trace) => trace.id === newObj.id || trace.id === old?.id);

        if (updateIndex === -1) return;

        const rtEventTrace = mapPendingTraceFromRealTime(newObj);

        // Ignore non-default traces
        if (rtEventTrace.traceType !== "DEFAULT") {
          return;
        }

        const newTraces = [...currentTraces];
        let updatedTrace: TraceRow = { ...rtEventTrace };

        // If we have a topSpanId but no span info yet, fetch it
        if (rtEventTrace.topSpanId && !rtEventTrace.topSpanName) {
          try {
            const spanInfo = await getTraceTopSpanInfo(rtEventTrace.topSpanId);
            updatedTrace = { ...rtEventTrace, ...spanInfo };
          } catch (error) {
            console.warn("Failed to fetch span info for updated trace:", error);
          }
        }

        newTraces[updateIndex] = updatedTrace;
        setTraces(newTraces);
      }
    },
    [getTraceTopSpanInfo, pageSize]
  );

  const { supabaseClient: supabase } = useUserContext();

  useEffect(() => {
    if (!supabase) {
      return;
    }

    if (filter.length > 0 || !!textSearchFilter) {
      supabase.removeAllChannels();
      return;
    }

    // When enableStreaming changes, need to remove all channels and, if enabled, re-subscribe
    supabase.channel("traces-table").unsubscribe();

    const channel = supabase
      .channel("traces-table")
      .on<RealtimeTracePayload>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "traces",
          filter: `project_id=eq.${projectId}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT" && isCurrentTimestampIncluded) {
            await updateRealtimeTraces("INSERT", payload.old, payload.new);
          }
        }
      )
      .on<RealtimeTracePayload>(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "traces",
          filter: `project_id=eq.${projectId}`,
        },
        async (payload) => {
          if (payload.eventType === "UPDATE" && isCurrentTimestampIncluded) {
            await updateRealtimeTraces("UPDATE", payload.old, payload.new);
          }
        }
      )
      .subscribe();

    // remove the channel on unmount
    return () => {
      channel.unsubscribe();
    };
  }, [projectId, isCurrentTimestampIncluded, supabase, filter.length, textSearchFilter, updateRealtimeTraces]);

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
        await getTraces();
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
