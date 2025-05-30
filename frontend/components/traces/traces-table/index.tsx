"use client";
import { Row } from "@tanstack/react-table";
import { isEmpty } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import RefreshButton from "@/components/traces/refresh-button";
import SearchTracesInput from "@/components/traces/search-traces-input";
import { columns, filters } from "@/components/traces/traces-table/columns";
import DeleteSelectedRows from "@/components/ui/DeleteSelectedRows";
import { useUserContext } from "@/contexts/user-context";
import { useToast } from "@/lib/hooks/use-toast";
import { SpanType, Trace } from "@/lib/traces/types";
import { PaginatedResponse } from "@/lib/types";

import { DataTable } from "../../ui/datatable";
import DataTableFilter, { DataTableFilterList } from "../../ui/datatable-filter";
import DateRangeFilter from "../../ui/date-range-filter";

interface TracesTableProps {
  traceId: string | null;
  onRowClick?: (rowId: string) => void;
}

const LIVE_UPDATES_STORAGE_KEY = "traces-live-updates";

export default function TracesTable({ traceId, onRowClick }: TracesTableProps) {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { projectId } = useParams();
  const { toast } = useToast();

  const pageNumber = searchParams.get("pageNumber") ? parseInt(searchParams.get("pageNumber")!) : 0;
  const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!) : 50;
  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const textSearchFilter = searchParams.get("search");
  const searchIn = searchParams.getAll("searchIn");

  const [traces, setTraces] = useState<Trace[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number>(0); // including the filtering
  const [enableLiveUpdates, setEnableLiveUpdates] = useState<boolean>(true);

  const pageCount = useMemo(() => Math.ceil(totalCount / pageSize), [totalCount, pageSize]);

  useEffect(() => {
    const stored = globalThis?.localStorage?.getItem(LIVE_UPDATES_STORAGE_KEY);
    setEnableLiveUpdates(stored == null ? true : stored === "true");
  }, []);

  const isCurrentTimestampIncluded = !!pastHours || (!!endDate && new Date(endDate) >= new Date());

  const tracesRef = useRef<Trace[] | undefined>(traces);

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

      const data = (await res.json()) as PaginatedResponse<Trace>;
      console.log(data.items);
      setTraces(data.items);
      setTotalCount(data.totalCount);
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

  const dbTraceRowToTrace = (row: Record<string, any>): Trace => ({
    startTime: row.start_time,
    endTime: row.end_time,
    id: row.id,
    sessionId: row.session_id,
    inputTokenCount: row.input_token_count,
    outputTokenCount: row.output_token_count,
    totalTokenCount: row.total_token_count,
    inputCost: row.input_cost,
    outputCost: row.output_cost,
    cost: row.cost,
    metadata: row.metadata,
    hasBrowserSession: row.has_browser_session,
    topSpanId: row.top_span_id,
    traceType: row.trace_type,
    agentSessionId: row.agent_session_id,
    topSpanInputPreview: null,
    topSpanOutputPreview: null,
    topSpanName: null,
    topSpanType: null,
    topSpanPath: null,
    status: row.status,
    userId: row.user_id,
  });

  const getTraceTopSpanInfo = useCallback(
    async (
      spanId: string
    ): Promise<{
      topSpanName: string | null;
      topSpanType: SpanType | null;
      topSpanInputPreview: any | null;
      topSpanOutputPreview: any | null;
    }> => {
      try {
        const response = await fetch(`/api/projects/${projectId}/spans/${spanId}/basic-info`);

        if (!response.ok) {
          throw new Error(`Failed to fetch span info: ${response.status} ${response.statusText}`);
        }

        const span = await response.json();
        return {
          topSpanName: span?.name ?? null,
          topSpanType: span?.spanType ?? null,
          topSpanInputPreview: span?.inputPreview ?? null,
          topSpanOutputPreview: span?.outputPreview ?? null,
        };
      } catch (error) {
        toast({
          title: "Failed to load span information",
          variant: "destructive",
        });

        return {
          topSpanName: null,
          topSpanType: null,
          topSpanInputPreview: null,
          topSpanOutputPreview: null,
        };
      }
    },
    [projectId, toast]
  );

  const updateRealtimeTraces = useCallback(
    async (eventType: "INSERT" | "UPDATE", old: Record<string, any>, newObj: Record<string, any>) => {
      const currentTraces = tracesRef.current;
      if (eventType === "INSERT") {
        const insertIndex = currentTraces?.findIndex((trace) => trace.startTime <= newObj.start_time);
        const newTraces = currentTraces ? [...currentTraces] : [];
        const rtEventTrace = dbTraceRowToTrace(newObj);
        // Ignore eval traces
        if (rtEventTrace.traceType !== "DEFAULT") {
          return;
        }
        const { topSpanType, topSpanName, topSpanInputPreview, topSpanOutputPreview, ...rest } = rtEventTrace;
        const newTrace =
          rtEventTrace.topSpanType === null && rtEventTrace.topSpanId != null
            ? {
              ...(await getTraceTopSpanInfo(rtEventTrace.topSpanId)),
              ...rest,
            }
            : rtEventTrace;
        newTraces.splice(Math.max(insertIndex ?? 0, 0), 0, newTrace);
        if (newTraces.length > pageSize) {
          newTraces.splice(pageSize, newTraces.length - pageSize);
        }
        setTraces(newTraces);
        setTotalCount((prev) => parseInt(`${prev}`) + 1);
      } else if (eventType === "UPDATE") {
        if (currentTraces === undefined || currentTraces.length === 0) {
          return;
        }
        const updateIndex = currentTraces.findIndex((trace) => trace.id === newObj.id || trace.id === old.id);
        if (updateIndex !== -1) {
          const newTraces = [...currentTraces];
          const existingTrace = currentTraces[updateIndex];
          const rtEventTrace = dbTraceRowToTrace(newObj);
          // Ignore eval traces
          if (rtEventTrace.traceType !== "DEFAULT") {
            return;
          }
          const { topSpanType, topSpanName, topSpanInputPreview, topSpanOutputPreview, ...rest } = rtEventTrace;
          if (existingTrace.topSpanType === null && rtEventTrace.topSpanId != null) {
            const newTrace = {
              ...(await getTraceTopSpanInfo(rtEventTrace.topSpanId)),
              ...rest,
            };
            newTraces[updateIndex] = newTrace;
          } else {
            newTraces[updateIndex] = dbTraceRowToTrace(newObj);
          }
          setTraces(newTraces);
        }
      }
    },
    [getTraceTopSpanInfo, pageSize]
  ); // only depends on pageSize now

  const { supabaseClient: supabase } = useUserContext();

  useEffect(() => {
    if (!supabase) {
      return;
    }

    if (!enableLiveUpdates || filter.length > 0) {
      supabase.removeAllChannels();
      return;
    }

    // When enableStreaming changes, need to remove all channels and, if enabled, re-subscribe
    supabase.channel("table-db-changes").unsubscribe();

    const channel = supabase
      .channel("table-db-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "traces",
          filter: `project_id=eq.${projectId}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            if (isCurrentTimestampIncluded) {
              await updateRealtimeTraces("INSERT", payload.old, payload.new);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "traces",
          filter: `project_id=eq.${projectId}`,
        },
        async (payload) => {
          if (payload.eventType === "UPDATE") {
            if (isCurrentTimestampIncluded) {
              await updateRealtimeTraces("UPDATE", payload.old, payload.new);
            }
          }
        }
      )
      .subscribe();

    // remove the channel on unmount
    return () => {
      channel.unsubscribe();
    };
  }, [enableLiveUpdates, projectId, isCurrentTimestampIncluded, supabase, filter.length]);

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
    (row: Row<Trace>) => {
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
      focusedRowId={traceId}
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
