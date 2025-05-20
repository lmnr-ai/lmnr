"use client";
import { Row } from "@tanstack/react-table";
import { isEmpty } from "lodash";
import { RefreshCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import SearchTracesInput from "@/components/traces/search-traces-input";
import { columns, filters } from "@/components/traces/traces-table/columns";
import DeleteSelectedRows from "@/components/ui/DeleteSelectedRows";
import { useProjectContext } from "@/contexts/project-context";
import { useUserContext } from "@/contexts/user-context";
import { useToast } from "@/lib/hooks/use-toast";
import { SpanType, Trace } from "@/lib/traces/types";
import { DatatableFilter, PaginatedResponse } from "@/lib/types";
import { getFilterFromUrlParams } from "@/lib/utils";

import { Button } from "../../ui/button";
import { DataTable } from "../../ui/datatable";
import DataTableFilter from "../../ui/datatable-filter";
import DateRangeFilter from "../../ui/date-range-filter";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";

interface TracesTableProps {
  traceId: string | null;
  onRowClick?: (rowId: string) => void;
}

const LIVE_UPDATES_STORAGE_KEY = "traces-live-updates";

export default function TracesTable({ traceId, onRowClick }: TracesTableProps) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const pageNumber = searchParams.get("pageNumber") ? parseInt(searchParams.get("pageNumber")!) : 0;
  const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!) : 50;
  const filter = searchParams.get("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const textSearchFilter = searchParams.get("search");
  const searchIn = searchParams.getAll("searchIn");
  const { projectId } = useProjectContext();
  const [traces, setTraces] = useState<Trace[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number>(0); // including the filtering
  const pageCount = Math.ceil(totalCount / pageSize);
  const [enableLiveUpdates, setEnableLiveUpdates] = useState<boolean>(true);

  useEffect(() => {
    const stored = globalThis?.localStorage?.getItem(LIVE_UPDATES_STORAGE_KEY);
    setEnableLiveUpdates(stored == null ? true : stored === "true");
  }, []);

  const [activeFilters, setActiveFilters] = useState<DatatableFilter[]>(
    filter ? (getFilterFromUrlParams(filter) ?? []) : []
  );

  const isCurrentTimestampIncluded = !!pastHours || (!!endDate && new Date(endDate) >= new Date());

  const tracesRef = useRef<Trace[] | undefined>(traces);

  // Keep ref updated
  useEffect(() => {
    tracesRef.current = traces;
  }, [traces]);

  const getTraces = async () => {
    let queryFilter = searchParams.get("filter");
    setTraces(undefined);

    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams();
      for (const [key, value] of Object.entries(searchParams)) {
        if (key !== "pastHours") {
          sp.set(key, value as string);
        }
      }
      sp.set("pastHours", "24");
      router.replace(`${pathName}?${sp.toString()}`);
      return;
    }

    let url = `/api/projects/${projectId}/traces?pageNumber=${pageNumber}&pageSize=${pageSize}`;
    if (pastHours != null) {
      url += `&pastHours=${pastHours}`;
    }
    if (startDate != null) {
      url += `&startDate=${startDate}`;
    }
    if (endDate != null) {
      url += `&endDate=${endDate}`;
    }
    if (typeof queryFilter === "string") {
      url += `&filter=${encodeURIComponent(queryFilter)}`;
    } else if (Array.isArray(queryFilter)) {
      const filters = encodeURIComponent(JSON.stringify(queryFilter));
      url += `&filter=${filters}`;
    }
    if (typeof textSearchFilter === "string" && textSearchFilter.length > 0) {
      url += `&search=${textSearchFilter}`;
    }

    if (isEmpty(searchIn) || searchIn?.length === 2) {
      url += `&searchIn=input&searchIn=output`;
    } else {
      url += `&searchIn=${searchIn?.[0]}`;
    }

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = (await res.json()) as PaginatedResponse<Trace>;

    setTraces(data.items);
    setTotalCount(data.totalCount);
  };

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
  });

  const getTraceTopSpanInfo = async (
    spanId: string
  ): Promise<{
    topSpanName: string | null;
    topSpanType: SpanType | null;
    topSpanInputPreview: any | null;
    topSpanOutputPreview: any | null;
  }> => {
    const response = await fetch(`/api/projects/${projectId}/spans/${spanId}/basic-info`);
    const span = await response.json();
    return {
      topSpanName: span?.name ?? null,
      topSpanType: span?.spanType ?? null,
      topSpanInputPreview: span?.inputPreview ?? null,
      topSpanOutputPreview: span?.outputPreview ?? null,
    };
  };

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
    []
  ); // only depends on pageSize now

  const { supabaseClient: supabase } = useUserContext();

  useEffect(() => {
    if (!supabase) {
      return;
    }

    if (!enableLiveUpdates) {
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
  }, [enableLiveUpdates, projectId, isCurrentTimestampIncluded, supabase]);

  useEffect(() => {
    getTraces();
  }, [
    projectId,
    pageNumber,
    pageSize,
    filter,
    pastHours,
    startDate,
    endDate,
    textSearchFilter,
    JSON.stringify(searchIn),
  ]);

  const handleDeleteTraces = async (traceId: string[]) => {
    const response = await fetch(`/api/projects/${projectId}/traces?traceId=${traceId.join(",")}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      toast({
        title: "Failed to delete traces",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Traces deleted",
        description: `Successfully deleted ${traceId.length} trace(s).`,
      });
      getTraces();
    }
  };

  const handleUpdateFilters = (newFilters: DatatableFilter[]) => {
    setActiveFilters(newFilters);
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
      onPageChange={(pageNumber, pageSize) => {
        searchParams.set("pageNumber", pageNumber.toString());
        searchParams.set("pageSize", pageSize.toString());
        router.push(`${pathName}?${searchParams.toString()}`);
      }}
      totalItemsCount={totalCount}
      enableRowSelection
      selectionPanel={(selectedRowIds) => (
        <div className="flex flex-col space-y-2">
          <DeleteSelectedRows selectedRowIds={selectedRowIds} onDelete={handleDeleteTraces} entityName="traces" />
        </div>
      )}
    >
      <DataTableFilter possibleFilters={filters} activeFilters={activeFilters} updateFilters={handleUpdateFilters} />
      <DateRangeFilter />
      <Button onClick={getTraces} variant="outline">
        <RefreshCcw size={16} className="mr-2" />
        Refresh
      </Button>
      {supabase && (
        <div className="flex items-center space-x-2">
          <Switch
            checked={enableLiveUpdates}
            onCheckedChange={(checked) => {
              setEnableLiveUpdates(checked);
              localStorage.setItem(LIVE_UPDATES_STORAGE_KEY, checked.toString());
            }}
          />
          <Label>Live</Label>
        </div>
      )}
      <SearchTracesInput />
    </DataTable>
  );
}
