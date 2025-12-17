"use client";

import { debounce } from "lodash";
import { AlertCircle, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { ChartRendererCore } from "@/components/chart-builder/charts";
import { ChartType } from "@/components/chart-builder/types";
import { ColumnInfo, transformDataToColumns } from "@/components/chart-builder/utils";
import { useDashboardEditorStoreContext } from "@/components/dashboard/editor/dashboard-editor-store";
import { QueryBuilderFields } from "@/components/dashboard/editor/fields";
import { getTimeColumn } from "@/components/dashboard/editor/table-schemas";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { Label } from "@/components/ui/label.tsx";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { QueryStructure, TimeRange } from "@/lib/actions/sql/types.ts";

const needsTimeSeries = (chartType?: ChartType): boolean =>
  chartType === ChartType.LineChart || chartType === ChartType.BarChart;

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

  const { chart, setQuery, setChartConfig, executeQuery, isLoading, error, data, setLoading, setError } =
    useDashboardEditorStoreContext((state) => ({
      chart: state.chart,
      setQuery: state.setQuery,
      setChartConfig: state.setChartConfig,
      executeQuery: state.executeQuery,
      isLoading: state.isLoading,
      error: state.error,
      data: state.data,
      setLoading: state.setLoading,
      setError: state.setError,
    }));

  const formValues = useWatch({ control });

  const columns: ColumnInfo[] = useMemo(() => transformDataToColumns(data), [data]);

  const chartType = chart.settings.config.type;
  const totalValue = chart.settings.config.total ?? false;

  const chartConfig = useMemo(() => {
    const { metrics, dimensions } = formValues;

    if (!chartType || !metrics?.[0]) {
      return null;
    }

    const isTimeSeries = needsTimeSeries(chartType);
    const isHorizontalBar = chartType === ChartType.HorizontalBarChart;
    const firstMetric = metrics[0];
    const metricValue = firstMetric.alias || firstMetric.column;
    const dimensionValue = isTimeSeries ? "time" : dimensions?.[0] || columns[0]?.name || "x";

    return {
      type: chartType,
      x: isHorizontalBar ? metricValue : dimensionValue,
      y: isHorizontalBar ? dimensionValue : metricValue,
      breakdown: isTimeSeries ? dimensions?.[0] : undefined,
      total: false,
    };
  }, [chartType, formValues]);

  const chartConfigForRendering = useMemo(() => {
    if (!chartConfig) return null;
    return {
      ...chartConfig,
      total: totalValue,
    };
  }, [chartConfig, totalValue]);

  const generateAndExecuteQuery = useCallback(async () => {
    if (!formState.isValid || !projectId) {
      return;
    }

    const { table, metrics, dimensions, filters, orderBy, limit } = getValues();

    setLoading(true);
    setError(null);

    try {
      const isHorizontalBar = chartType === ChartType.HorizontalBarChart;
      const allFilters = [...(filters || [])];

      if (isHorizontalBar) {
        const timeColumn = getTimeColumn(table);
        allFilters.push(
          { field: timeColumn, op: "gte" as const, stringValue: "{start_time:DateTime64}" },
          { field: timeColumn, op: "lte" as const, stringValue: "{end_time:DateTime64}" }
        );
      }

      const queryStructure: QueryStructure = {
        table,
        metrics,
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
        setChartConfig({
          type: chartConfig.type!,
          x: chartConfig.x!,
          y: chartConfig.y!,
          breakdown: chartConfig.breakdown,
          total: chart.settings.config.total ?? false,
        });
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
    getValues,
    setQuery,
    setChartConfig,
    executeQuery,
    setLoading,
    setError,
    chartType,
  ]);

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
  }, [formValues, formState.isValid, generateAndExecuteQuery, handleSubmit, isLoadingChart]);

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
            <DateRangeFilter buttonDisabled className="w-fit" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-secondary-foreground/80">Group by</Label>
            <Select value="1 hour">
              <SelectTrigger className="w-fit text-secondary-foreground" disabled>
                <SelectValue placeholder="select group by">1 hour</SelectValue>
              </SelectTrigger>
            </Select>
          </div>
        </div>
        <div className="flex flex-col justify-center items-center w-full min-h-96 p-4 self-center border rounded border-dashed bg-secondary">
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
              <ChartRendererCore config={chartConfigForRendering} data={data} columns={columns} />
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
