"use client";

import { debounce } from "lodash";
import { AlertCircle, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { ChartRendererCore } from "@/components/chart-builder/charts";
import {
  type ChartConfig,
  ChartType,
  resolveDisplayMode,
  type TableColumnConfig,
} from "@/components/chart-builder/types";
import { type ColumnInfo, transformDataToColumns } from "@/components/chart-builder/utils";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { QueryBuilderFields } from "@/components/dashboards/editor/fields";
import { getTimeColumn } from "@/components/dashboards/editor/table-schemas";
import { getDefaultTimeRange, injectIdMetrics, needsTimeSeries } from "@/components/dashboards/editor/utils";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { Label } from "@/components/ui/label.tsx";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { type QueryStructure } from "@/lib/actions/sql/types.ts";

export const Form = ({ isLoadingChart }: { isLoadingChart: boolean }) => {
  const { projectId } = useParams();
  const { control, formState, getValues, handleSubmit } = useFormContext<QueryStructure>();

  const {
    chart,
    setQuery,
    setChartConfig,
    executeQuery,
    isLoading,
    error,
    loadError,
    data,
    setLoading,
    setError,
    parameters,
    setParameterValue,
    tableHasMore,
    tableIsFetching,
    fetchNextTablePage,
  } = useDashboardEditorStoreContext((state) => ({
    chart: state.chart,
    setQuery: state.setQuery,
    setChartConfig: state.setChartConfig,
    executeQuery: state.executeQuery,
    isLoading: state.isLoading,
    error: state.error,
    loadError: state.loadError,
    data: state.data,
    setLoading: state.setLoading,
    setError: state.setError,
    parameters: state.parameters,
    setParameterValue: state.setParameterValue,
    tableHasMore: state.tableHasMore,
    tableIsFetching: state.tableIsFetching,
    fetchNextTablePage: state.fetchNextTablePage,
  }));

  const formValues = useWatch({ control });

  // Ref to the latest chart so generateAndExecuteQuery reads fresh tableColumnConfig
  // without re-creating the callback on every column reorder/resize (which would
  // re-trigger the debounced query execution).
  const chartRef = useRef(chart);
  useEffect(() => {
    chartRef.current = chart;
  }, [chart]);

  const columns: ColumnInfo[] = useMemo(() => transformDataToColumns(data), [data]);

  const handleColumnConfigChange = useCallback(
    (columnConfig: TableColumnConfig) => {
      const currentConfig = chart.settings.config;
      if (currentConfig.type === ChartType.Table) {
        setChartConfig({
          ...currentConfig,
          tableColumnConfig: columnConfig,
        });
      }
    },
    [chart.settings.config, setChartConfig]
  );

  const handleFetchNextPage = useCallback(() => {
    if (projectId) {
      fetchNextTablePage(projectId as string);
    }
  }, [projectId, fetchNextTablePage]);

  const chartType = chart.settings.config.type;
  const displayMode = resolveDisplayMode(chart.settings.config);

  const chartConfig = useMemo(() => {
    const { metrics, dimensions } = formValues;

    if (!chartType || !metrics?.[0]) {
      return null;
    }

    if (chartType === ChartType.Table) {
      const tableConfig = chart.settings.config.type === ChartType.Table ? chart.settings.config : null;
      return {
        type: chartType,
        displayMode: "none" as const,
        tableColumnConfig: tableConfig?.tableColumnConfig,
      };
    }

    const isTimeSeries = needsTimeSeries(chartType);
    const isHorizontalBar = chartType === ChartType.HorizontalBarChart;
    const firstMetric = metrics[0];
    const metricValue = firstMetric.alias || (firstMetric.fn === "raw" ? "value" : firstMetric.column);
    const dimensionValue = isTimeSeries ? "time" : dimensions?.[0] || columns[0]?.name || "x";

    return {
      type: chartType,
      x: isHorizontalBar ? metricValue : dimensionValue,
      y: isHorizontalBar ? dimensionValue : metricValue,
      breakdown: isTimeSeries ? dimensions?.[0] : undefined,
      displayMode: "none" as const,
    };
    // NOTE: deliberately omitting `columns` — it's derived from `data` which is
    // set by executeQuery, so including it creates an infinite re-fetch cycle.
    // The `columns[0]?.name` fallback below uses the value from the previous
    // render's closure, which is acceptable for this UI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, formValues]);

  const chartConfigForRendering = useMemo((): ChartConfig | null => {
    if (!chartConfig) return null;
    if (chartConfig.type === ChartType.Table && chart.settings.config.type === ChartType.Table) {
      return {
        ...chartConfig,
        displayMode,
        tableColumnConfig: chart.settings.config.tableColumnConfig,
      };
    }
    return { ...chartConfig, displayMode };
  }, [chartConfig, displayMode, chart.settings.config]);

  // Hidden columns are derived from the form's metrics plus any runtime-injected
  // click-target IDs — each metric carries its own `hidden` flag. No separate
  // hiddenColumns array to keep in sync.
  const hiddenColumns = useMemo(() => {
    const formMetrics = (formValues.metrics ?? []).filter((m): m is QueryStructure["metrics"][number] => !!m?.fn);
    const resolved = injectIdMetrics(
      formMetrics,
      formValues.dimensions as string[] | undefined,
      formValues.table,
      chartType
    );
    return resolved
      .filter((m) => m.hidden)
      .map((m) => m.alias ?? m.column ?? "")
      .filter((c) => c.length > 0);
  }, [formValues.metrics, formValues.dimensions, formValues.table, chartType]);

  const generateAndExecuteQuery = useCallback(async () => {
    if (!formState.isValid || !projectId) {
      return;
    }

    const { table, metrics, dimensions, filters, orderBy, limit } = getValues();

    setLoading(true);
    setError(null);

    try {
      const isHorizontalBar = chartType === ChartType.HorizontalBarChart;
      const isTable = chartType === ChartType.Table;
      const allFilters = [...(filters || [])];

      // Non-time-series charts (Table, HorizontalBar) don't use queryStructure.timeRange,
      // so they'd otherwise pull every row ever. Append the dashboard's selected
      // start_time/end_time as a WHERE filter on the table's time column so the
      // result is scoped to the current date range. Line/Bar charts get this for
      // free via timeRange → the backend generates the WHERE clause itself.
      if (isHorizontalBar || isTable) {
        const timeColumn = getTimeColumn(table);
        allFilters.push(
          { field: timeColumn, op: "gte" as const, stringValue: "{start_time:DateTime64}" },
          { field: timeColumn, op: "lte" as const, stringValue: "{end_time:DateTime64}" }
        );
      }

      const injectedMetrics = injectIdMetrics(metrics, dimensions, table, chartType);

      const queryStructure: QueryStructure = {
        table,
        metrics: injectedMetrics,
        dimensions: dimensions || [],
        filters: allFilters,
        orderBy: [],
        ...(orderBy && orderBy.length > 0 && { orderBy }),
        limit,
      };

      if (needsTimeSeries(chartType)) {
        queryStructure.timeRange = getDefaultTimeRange(table);
      }

      const sqlResponse = await fetch(`/api/projects/${projectId}/sql/from-json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queryStructure }),
      });

      const sqlData = await sqlResponse.json();

      if (!sqlResponse.ok || !sqlData.success) {
        throw new Error(sqlData.error || "Failed to convert query structure to SQL");
      }

      // Update store with new query and config
      setQuery(sqlData.sql);
      if (chartConfig) {
        const liveConfig = chartRef.current.settings.config;
        const updatedConfig = {
          ...chartConfig,
          displayMode,
          ...(isTable && liveConfig.type === ChartType.Table
            ? { tableColumnConfig: liveConfig.tableColumnConfig }
            : {}),
        };
        setChartConfig(updatedConfig as ChartConfig);
      }

      await executeQuery(projectId as string);
    } catch (err) {
      console.error("Failed to generate and execute query:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to generate and execute query";
      setError(errorMessage);
      setLoading(false);
    }
  }, [
    formState.isValid,
    projectId,
    chartConfig,
    displayMode,
    getValues,
    setQuery,
    setChartConfig,
    executeQuery,
    setLoading,
    setError,
    chartType,
  ]);

  // Single debounced effect that re-executes when form values or
  // parameters (time range, interval) change. Parameters live in the
  // zustand store and are read at execution time via getFormattedParameters().
  useEffect(() => {
    if (isLoadingChart || loadError) {
      return;
    }

    const debouncedExecution = debounce(() => {
      if (formState.isValid) {
        generateAndExecuteQuery();
      }
    }, 300);

    debouncedExecution();

    return () => {
      debouncedExecution.cancel();
    };
  }, [formValues, formState.isValid, generateAndExecuteQuery, handleSubmit, isLoadingChart, loadError, parameters]);

  return (
    <div className="grid grid-cols-4 h-full gap-4 overflow-hidden">
      <ScrollArea className="col-span-1 border rounded bg-secondary relative">
        <QueryBuilderFields isFormValid={formState.isValid} hasChartConfig={!!chartConfig} />
        {isLoadingChart && (
          <div className="absolute inset-0 bg-background/40 z-20 backdrop-blur-xs flex items-center justify-center rounded">
            <div className="flex flex-col items-center space-y-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          </div>
        )}
      </ScrollArea>

      <div className="col-span-3 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="grid gap-1">
            <Label className="text-xs text-secondary-foreground/80">Time range</Label>
            <DateRangeFilter
              className="w-fit"
              mode="state"
              onChange={(value) => {
                if (value.pastHours) {
                  const now = new Date();
                  const start = new Date(now.getTime() - Number(value.pastHours) * 60 * 60 * 1000);
                  setParameterValue("start_time", start);
                  setParameterValue("end_time", now);
                } else {
                  if (value.startDate) {
                    setParameterValue("start_time", new Date(value.startDate));
                  }
                  if (value.endDate) {
                    setParameterValue("end_time", new Date(value.endDate));
                  }
                }
              }}
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-secondary-foreground/80">Group by</Label>
            <Select
              value={String(parameters.find((p) => p.name === "interval_unit")?.value ?? "HOUR")}
              onValueChange={(value) => setParameterValue("interval_unit", value)}
            >
              <SelectTrigger className="w-fit text-secondary-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MINUTE">By minute</SelectItem>
                <SelectItem value="HOUR">By hour</SelectItem>
                <SelectItem value="DAY">By day</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col justify-start items-center w-full flex-1 min-h-0 max-h-[600px] p-4 self-center border rounded border-dashed bg-secondary overflow-hidden">
          {chart.name && (
            <div className="w-full mb-2">
              <span className="font-medium text-lg text-secondary-foreground truncate">{chart.name}</span>
            </div>
          )}
          {loadError ? (
            <div className="flex flex-1 flex-col justify-center items-center space-y-3 text-destructive max-w-md">
              <AlertCircle className="w-10 h-10" />
              <div className="text-center">
                <p className="text-sm font-medium">Couldn't load chart</p>
                <p className="text-xs mt-2 text-muted-foreground">
                  This chart's saved query couldn't be parsed back into the editor. Saving is disabled to prevent
                  overwriting it.
                </p>
                <p className="text-xs mt-2 text-muted-foreground/70 break-all">{loadError}</p>
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center space-y-4 text-muted-foreground">
              <Loader2 className="w-10 h-10 animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium">Generating chart...</p>
                <p className="text-xs mt-1 text-muted-foreground/70">This may take a few moments</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-1 flex-col justify-center items-center space-y-3 text-destructive max-w-md">
              <AlertCircle className="w-10 h-10" />
              <div className="text-center">
                <p className="text-sm font-medium">Failed to execute query</p>
                <p className="text-xs mt-2 text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : chartConfigForRendering ? (
            <div className="w-full h-full">
              <ChartRendererCore
                config={chartConfigForRendering}
                data={data}
                columns={columns}
                hiddenColumns={hiddenColumns}
                onColumnConfigChange={handleColumnConfigChange}
                hasMore={tableHasMore}
                isFetching={tableIsFetching}
                fetchNextPage={handleFetchNextPage}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-3 text-muted-foreground">
              <p className="text-sm">Unable to render chart</p>
              <p className="text-xs text-muted-foreground/70">Please check your configuration</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
