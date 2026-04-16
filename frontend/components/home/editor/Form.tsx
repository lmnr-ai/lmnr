"use client";

import { debounce } from "lodash";
import { AlertCircle, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { ChartRendererCore } from "@/components/chart-builder/charts";
import {
  type ChartConfig,
  ChartType,
  resolveDisplayMode,
  type TableColumnConfig,
} from "@/components/chart-builder/types";
import { type ColumnInfo, transformDataToColumns } from "@/components/chart-builder/utils";
import { TABLE_DEFAULT_LIMIT, TABLE_MAX_LIMIT } from "@/components/home/editor/constants";
import { QueryBuilderFields } from "@/components/home/editor/fields";
import { useHomeEditorStoreContext } from "@/components/home/editor/home-editor-store";
import { getTimeColumn } from "@/components/home/editor/table-schemas";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { Label } from "@/components/ui/label.tsx";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { type QueryStructure, type TimeRange } from "@/lib/actions/sql/types.ts";

const needsTimeSeries = (chartType?: ChartType): boolean =>
  chartType === ChartType.LineChart || chartType === ChartType.BarChart;

const ID_COLUMNS_BY_TABLE: Record<string, string[]> = {
  spans: ["trace_id", "span_id"],
  traces: ["id"],
  signal_events: ["signal_id", "trace_id"],
};

const getDefaultTimeRange = (table: string): TimeRange => {
  const timeColumn = getTimeColumn(table);
  return {
    column: timeColumn,
    from: "{start_time:DateTime64}",
    to: "{end_time:DateTime64}",
    fillGaps: true,
    intervalValue: "1",
    intervalUnit: "{interval_unit:String}",
  };
};

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
    data,
    setLoading,
    setError,
    parameters,
    setParameterValue,
  } = useHomeEditorStoreContext((state) => ({
    chart: state.chart,
    setQuery: state.setQuery,
    setChartConfig: state.setChartConfig,
    executeQuery: state.executeQuery,
    isLoading: state.isLoading,
    error: state.error,
    data: state.data,
    setLoading: state.setLoading,
    setError: state.setError,
    parameters: state.parameters,
    setParameterValue: state.setParameterValue,
  }));

  const formValues = useWatch({ control });

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

  const chartType = chart.settings.config.type;
  const displayMode = resolveDisplayMode(chart.settings.config);

  const chartConfig = useMemo(() => {
    const { metrics, dimensions } = formValues;

    if (!chartType || !metrics?.[0]) {
      return null;
    }

    // Table charts don't have x/y/breakdown axes — config carries only the type.
    if (chartType === ChartType.Table) {
      return {
        type: chartType,
        displayMode: "none" as const,
        hiddenColumns: chart.settings.config.type === ChartType.Table ? chart.settings.config.hiddenColumns : [],
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
        hiddenColumns: chart.settings.config.hiddenColumns,
        tableColumnConfig: chart.settings.config.tableColumnConfig,
      };
    }
    return { ...chartConfig, displayMode };
  }, [chartConfig, displayMode, chart.settings.config]);

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
      const needsIdInjection = isHorizontalBar || isTable;
      const allFilters = [...(filters || [])];

      if (isHorizontalBar || isTable) {
        const timeColumn = getTimeColumn(table);
        allFilters.push(
          { field: timeColumn, op: "gte" as const, stringValue: "{start_time:DateTime64}" },
          { field: timeColumn, op: "lte" as const, stringValue: "{end_time:DateTime64}" }
        );
      }

      const injectedMetrics = [...metrics];
      const injectedIdColumns: string[] = [];
      if (needsIdInjection) {
        const allExisting = new Set([
          ...metrics.map((m) => m.column),
          ...metrics.map((m) => m.alias),
          ...(dimensions || []),
        ]);
        const inject = (column: string) => {
          if (!allExisting.has(column)) {
            injectedMetrics.push({ fn: "raw", column, alias: column, args: [] });
            injectedIdColumns.push(column);
          }
        };

        for (const col of ID_COLUMNS_BY_TABLE[table] ?? []) {
          inject(col);
        }
      }

      // Table charts cap result size client-side so a missing/oversized limit can't
      // return an unbounded result set into the renderer.
      const effectiveLimit =
        chartType === ChartType.Table ? Math.min(Math.max(1, limit ?? TABLE_DEFAULT_LIMIT), TABLE_MAX_LIMIT) : limit;

      const queryStructure: QueryStructure = {
        table,
        metrics: injectedMetrics,
        dimensions: dimensions || [],
        filters: allFilters,
        orderBy: [],
        ...(orderBy && orderBy.length > 0 && { orderBy }),
        limit: effectiveLimit,
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
        const updatedConfig = {
          ...chartConfig,
          displayMode,
        };
        if (isTable && "hiddenColumns" in updatedConfig) {
          const userColumns = new Set(metrics.map((m) => m.column));
          const idCols = ID_COLUMNS_BY_TABLE[table] ?? [];
          updatedConfig.hiddenColumns = idCols.filter((col) => !userColumns.has(col));
        }
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
    if (isLoadingChart) {
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
  }, [formValues, formState.isValid, generateAndExecuteQuery, handleSubmit, isLoadingChart, parameters]);

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
        <div className="flex flex-col justify-start items-center w-full min-h-96 p-4 self-center border rounded border-dashed bg-secondary">
          {chart.name && (
            <div className="w-full mb-2">
              <span className="font-medium text-lg text-secondary-foreground truncate">{chart.name}</span>
            </div>
          )}
          {isLoading ? (
            <div className="flex flex-col items-center space-y-4 text-muted-foreground">
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
                onColumnConfigChange={handleColumnConfigChange}
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
