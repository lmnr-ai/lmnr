import { debounce } from "lodash";
import { useParams } from "next/navigation";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { ChartRendererCore } from "@/components/chart-builder/charts";
import { ChartType, type TableColumnConfig } from "@/components/chart-builder/types";
import { transformDataToColumns } from "@/components/chart-builder/utils";
import ChartHeader from "@/components/dashboards/chart-header";
import { useDashboardRefresh } from "@/components/dashboards/dashboard-refresh-context";
import { useDashboardSelectionStore } from "@/components/dashboards/dashboard-selection-store";
import { useDashboardTraceStore } from "@/components/dashboards/dashboard-trace-context";
import { TABLE_PAGE_SIZE } from "@/components/dashboards/editor/constants";
import { paginateQuery } from "@/components/dashboards/editor/utils";
import SelectionToolbar from "@/components/dashboards/selection-toolbar";
import { toTimeParameters, useDashboardTimeRange } from "@/components/dashboards/time-range";
import { type DashboardChart, getChartsUrl } from "@/components/dashboards/types";
import { useRunDashboardQuery } from "@/components/dashboards/use-run-dashboard-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast";

interface ChartProps {
  chart: DashboardChart;
}

const Chart = ({ chart }: ChartProps) => {
  const { id, dashboardId, name, settings, query } = chart;
  // Columns flagged hidden on their metric — set by the editor when a chart
  // was saved with auto-injected click-target IDs.
  const hiddenColumns = useMemo(
    () =>
      (settings.queryStructure?.metrics ?? [])
        .filter((m) => m.hidden)
        .map((m) => m.alias ?? m.column)
        .filter((c): c is string => !!c && c.length > 0),
    [settings.queryStructure]
  );
  const { projectId } = useParams();
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableHasMore, setTableHasMore] = useState(false);
  const [tableIsFetching, setTableIsFetching] = useState(false);
  const tablePageRef = useRef(0);
  const runQuery = useRunDashboardQuery(projectId as string);
  const openTrace = useDashboardTraceStore((s) => s.openTrace);
  const { refreshKey } = useDashboardRefresh();
  const { toast } = useToast();
  const { mutate: swrMutate } = useSWRConfig();
  const isTable = settings.config.type === ChartType.Table;
  // Only the owner changing re-renders this card; the drag itself lives in the chart.
  const selectionChartId = useDashboardSelectionStore((s) => s.chartId);

  const columns = useMemo(() => transformDataToColumns(data), [data]);

  const timeParameters = useDashboardTimeRange();

  // Cancels an in-flight pagination fetch when fetchData or a newer scroll
  // supersedes it — otherwise its rows would splice onto fresh page-0 data.
  const paginationAbortRef = useRef<AbortController | null>(null);

  const fetchTablePage = useCallback(
    async (page: number, parameters: Record<string, string | number>, signal?: AbortSignal) => {
      const rows = await runQuery(paginateQuery(query, page), parameters, signal);
      const hasMore = rows.length > TABLE_PAGE_SIZE;
      return { rows: hasMore ? rows.slice(0, TABLE_PAGE_SIZE) : rows, hasMore };
    },
    [runQuery, query]
  );

  const fetchData = useCallback(async () => {
    // Cancel any in-flight pagination — its rows would target the old query.
    paginationAbortRef.current?.abort();
    paginationAbortRef.current = null;
    setTableIsFetching(false);

    try {
      const parameters = toTimeParameters(timeParameters);
      setIsLoading(true);
      setError(null);

      if (isTable) {
        tablePageRef.current = 0;
        const { rows, hasMore } = await fetchTablePage(0, parameters);
        setData(rows);
        setTableHasMore(hasMore);
      } else {
        setData(await runQuery(query, parameters));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [runQuery, query, timeParameters, isTable, fetchTablePage]);

  const fetchNextTablePage = useCallback(async () => {
    if (tableIsFetching || !tableHasMore) return;

    // Abort any prior pagination (rapid scroll fires multiple times).
    paginationAbortRef.current?.abort();
    const controller = new AbortController();
    paginationAbortRef.current = controller;

    setTableIsFetching(true);
    try {
      const parameters = toTimeParameters(timeParameters);
      const nextPage = tablePageRef.current + 1;
      const { rows, hasMore } = await fetchTablePage(nextPage, parameters, controller.signal);
      tablePageRef.current = nextPage;
      setData((prev) => [...prev, ...rows]);
      setTableHasMore(hasMore);
    } catch {
      // Aborted — whoever replaced us owns state. Otherwise silently fail,
      // the user can scroll again to retry.
      if (controller.signal.aborted) return;
    } finally {
      if (paginationAbortRef.current === controller) {
        paginationAbortRef.current = null;
      }
      if (!controller.signal.aborted) setTableIsFetching(false);
    }
  }, [tableIsFetching, tableHasMore, timeParameters, fetchTablePage]);

  // refreshKey re-runs the fetch on a manual dashboard refresh.
  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const supportsSelection = settings.config.type === ChartType.LineChart || settings.config.type === ChartType.BarChart;

  const isOwner = selectionChartId === id;

  const persistColumnConfig = useMemo(
    () =>
      debounce(async (config: TableColumnConfig) => {
        const key = getChartsUrl(projectId as string, dashboardId);
        // Derive next state from the *current* SWR cache rather than a
        // closure-captured `settings`, so a concurrent layout-drag write
        // doesn't get overwritten with a stale layout.
        const applyConfig = (charts?: DashboardChart[]): DashboardChart[] =>
          (charts ?? []).map((c) =>
            c.id === id
              ? { ...c, settings: { ...c.settings, config: { ...c.settings.config, tableColumnConfig: config } } }
              : c
          );
        try {
          await swrMutate(
            key,
            async (charts?: DashboardChart[]) => {
              const target = charts?.find((c) => c.id === id);
              if (!target) return charts;
              const updatedSettings = {
                ...target.settings,
                config: { ...target.settings.config, tableColumnConfig: config },
              };
              const res = await fetch(key, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ updates: [{ id, settings: updatedSettings }] }),
              });
              if (!res.ok) {
                throw new Error("Failed to save column layout");
              }
              return applyConfig(charts);
            },
            {
              optimisticData: applyConfig,
              rollbackOnError: true,
              revalidate: false,
              populateCache: true,
            }
          );
        } catch {
          toast({ variant: "destructive", title: "Failed to save column layout" });
        }
      }, 500),
    [id, dashboardId, projectId, toast, swrMutate]
  );

  const handleBarClick = useCallback(
    (rowData: Record<string, any>) => {
      const signalId = rowData.signal_id;
      const traceId = rowData.trace_id || rowData.id;

      const spanId = rowData.span_id;
      if (traceId) {
        openTrace(String(traceId), spanId ? String(spanId) : undefined, signalId ? String(signalId) : undefined);
      }
    },
    [openTrace]
  );

  return (
    <div className="relative h-full">
      <div className="flex flex-col border rounded-lg p-3 h-full border-border relative overflow-hidden">
        <ChartHeader name={name} id={id} projectId={projectId as string} dashboardId={dashboardId} />
        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text text-muted-foreground">Error loading chart data</p>
            <p className="text-sm text-destructive-text">{error}</p>
          </div>
        ) : isLoading ? (
          <Skeleton className="h-full w-full bg-emphasis-1" />
        ) : (
          <ChartRendererCore
            config={settings.config}
            data={data}
            columns={columns}
            hiddenColumns={hiddenColumns}
            onBarClick={handleBarClick}
            selectionChartId={supportsSelection ? id : undefined}
            onColumnConfigChange={isTable ? persistColumnConfig : undefined}
            hasMore={tableHasMore}
            isFetching={tableIsFetching}
            fetchNextPage={fetchNextTablePage}
          />
        )}
      </div>
      {isOwner && <SelectionToolbar />}
    </div>
  );
};

export default memo(Chart);
