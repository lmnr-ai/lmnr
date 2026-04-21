import { debounce } from "lodash";
import { useParams, useSearchParams } from "next/navigation";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CategoricalChartFunc } from "recharts/types/chart/generateCategoricalChart";

import { ChartRendererCore } from "@/components/chart-builder/charts";
import { type ChartDragHandlers } from "@/components/chart-builder/charts/line-chart";
import { ChartType, type TableColumnConfig } from "@/components/chart-builder/types";
import { transformDataToColumns } from "@/components/chart-builder/utils";
import ChartHeader from "@/components/dashboards/chart-header";
import { useDashboardSelectionStore } from "@/components/dashboards/dashboard-selection-store";
import { useDashboardTraceStore } from "@/components/dashboards/dashboard-trace-context";
import SelectionToolbar from "@/components/dashboards/selection-toolbar";
import { type DashboardChart } from "@/components/dashboards/types";
import { IconResizeHandle } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { type GroupByInterval } from "@/lib/clickhouse/modifiers";
import { useToast } from "@/lib/hooks/use-toast";
import { convertToTimeParameters } from "@/lib/time";

const TABLE_PAGE_SIZE = 50;

interface ChartProps {
  chart: DashboardChart;
}

const Chart = ({ chart }: ChartProps) => {
  const { id, name, settings, query } = chart;
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Record<string, any>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableHasMore, setTableHasMore] = useState(false);
  const [tableIsFetching, setTableIsFetching] = useState(false);
  const tablePageRef = useRef(0);
  const openTrace = useDashboardTraceStore((s) => s.openTrace);
  const { toast } = useToast();
  const isTable = settings.config.type === ChartType.Table;
  const {
    chartId: selectionChartId,
    startLabel,
    endLabel,
    isDragging,
    startDrag,
    updateDrag,
    endDrag,
  } = useDashboardSelectionStore((s) => ({
    chartId: s.chartId,
    startLabel: s.startLabel,
    endLabel: s.endLabel,
    isDragging: s.isDragging,
    startDrag: s.startDrag,
    updateDrag: s.updateDrag,
    endDrag: s.endDrag,
  }));

  const columns = useMemo(() => transformDataToColumns(data), [data]);

  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const groupByInterval = searchParams.get("groupByInterval") as GroupByInterval | null;

  const timeParameters = useMemo(() => {
    if (pastHours) {
      return {
        pastHours,
        ...(groupByInterval && { groupByInterval }),
      };
    }

    if (startDate && endDate) {
      return {
        startTime: startDate,
        endTime: endDate,
        ...(groupByInterval && { groupByInterval }),
      };
    }
    return {
      pastHours: 24,
      ...(groupByInterval && { groupByInterval }),
    };
  }, [pastHours, startDate, endDate, groupByInterval]);

  const fetchTablePage = useCallback(
    async (page: number, parameters: Record<string, string | number>) => {
      const paginatedQuery = `${query} LIMIT ${TABLE_PAGE_SIZE + 1} OFFSET ${page * TABLE_PAGE_SIZE}`;
      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: paginatedQuery, projectId, parameters }),
      });

      if (!response.ok) {
        throw new Error("Failed to execute SQL query");
      }

      const rows: Record<string, any>[] = await response.json();
      const hasMore = rows.length > TABLE_PAGE_SIZE;
      return { rows: hasMore ? rows.slice(0, TABLE_PAGE_SIZE) : rows, hasMore };
    },
    [projectId, query]
  );

  const fetchData = useCallback(async () => {
    try {
      const { groupByInterval, ...rest } = timeParameters;
      const parameters = convertToTimeParameters(rest, groupByInterval);
      setIsLoading(true);
      setError(null);

      if (isTable) {
        tablePageRef.current = 0;
        const { rows, hasMore } = await fetchTablePage(0, parameters);
        setData(rows);
        setTableHasMore(hasMore);
      } else {
        const response = await fetch(`/api/projects/${projectId}/sql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, projectId, parameters }),
        });

        if (!response.ok) {
          throw new Error("Failed to execute SQL query");
        }

        setData(await response.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, query, timeParameters, isTable, fetchTablePage]);

  const fetchNextTablePage = useCallback(async () => {
    if (tableIsFetching || !tableHasMore) return;

    setTableIsFetching(true);
    try {
      const { groupByInterval, ...rest } = timeParameters;
      const parameters = convertToTimeParameters(rest, groupByInterval);
      const nextPage = tablePageRef.current + 1;
      const { rows, hasMore } = await fetchTablePage(nextPage, parameters);
      tablePageRef.current = nextPage;
      setData((prev) => [...prev, ...rows]);
      setTableHasMore(hasMore);
    } catch {
      // Silently fail — the user can scroll again to retry
    } finally {
      setTableIsFetching(false);
    }
  }, [tableIsFetching, tableHasMore, timeParameters, fetchTablePage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const supportsSelection = settings.config.type === ChartType.LineChart || settings.config.type === ChartType.BarChart;

  const onMouseDown: CategoricalChartFunc = useCallback(
    (e) => {
      if (e?.activeLabel) {
        startDrag(id, e.activeLabel);
      }
    },
    [id, startDrag]
  );

  const onMouseMove: CategoricalChartFunc = useCallback(
    (e) => {
      if (isDragging && e?.activeLabel) {
        updateDrag(e.activeLabel);
      }
    },
    [isDragging, updateDrag]
  );

  const onMouseUp = useCallback(() => {
    if (isDragging) {
      endDrag();
    }
  }, [isDragging, endDrag]);

  const isOwner = selectionChartId === id;
  const drag: ChartDragHandlers | undefined = useMemo(
    () =>
      supportsSelection
        ? {
            onMouseDown,
            onMouseMove,
            onMouseUp,
            refArea: {
              left: startLabel ?? undefined,
              right: endLabel ?? undefined,
            },
          }
        : undefined,
    [supportsSelection, onMouseDown, onMouseMove, onMouseUp, startLabel, endLabel]
  );

  const persistColumnConfig = useMemo(
    () =>
      debounce(async (config: TableColumnConfig) => {
        const updatedSettings = {
          ...settings,
          config: { ...settings.config, tableColumnConfig: config },
        };
        try {
          const res = await fetch(`/api/projects/${projectId}/dashboard-charts`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              updates: [{ id, settings: updatedSettings }],
            }),
          });
          if (!res.ok) {
            toast({ variant: "destructive", title: "Failed to save column layout" });
          }
        } catch {
          toast({ variant: "destructive", title: "Failed to save column layout" });
        }
      }, 500),
    [id, projectId, settings, toast]
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
    [openTrace, projectId]
  );

  return (
    <div className="relative h-full">
      <div className="flex flex-col border gap-2 rounded-lg p-4 h-full border-border relative">
        <ChartHeader name={name} id={id} projectId={projectId as string} />
        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text text-muted-foreground">Error loading chart data</p>
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ChartRendererCore
            config={settings.config}
            data={data}
            columns={columns}
            onBarClick={handleBarClick}
            syncId="dashboard"
            drag={drag}
            onColumnConfigChange={isTable ? persistColumnConfig : undefined}
            hasMore={tableHasMore}
            isFetching={tableIsFetching}
            fetchNextPage={fetchNextTablePage}
          />
        )}
        <IconResizeHandle className="size-4 absolute right-2 text-muted-foreground bottom-2" />
      </div>
      {isOwner && <SelectionToolbar />}
    </div>
  );
};

export default memo(Chart);
