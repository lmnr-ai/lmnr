"use client";

import { debounce } from "lodash";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { ChartRendererCore } from "@/components/chart-builder/charts";
import { ChartType } from "@/components/chart-builder/types";
import { ColumnInfo, transformDataToColumns } from "@/components/chart-builder/utils";
import { useDashboardEditorStoreContext } from "@/components/dashboard/editor/dashboard-editor-store";
import { QueryBuilderFields } from "@/components/dashboard/editor/fields";
import { VisualQueryBuilderForm } from "@/components/dashboard/editor/types";
import { Button } from "@/components/ui/button";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { QueryStructure, TimeRange } from "@/lib/actions/sql";

const createChartViaApi = async (projectId: string, data: { name: string; query: string; config: any }) => {
  const response = await fetch(`/api/projects/${projectId}/dashboard-charts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to create chart");
  }

  return response.json();
};

const updateChartViaApi = async (
  projectId: string,
  chartId: string,
  data: { name: string; query: string; config: any }
) => {
  const response = await fetch(`/api/projects/${projectId}/dashboard-charts/${chartId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to update chart");
  }

  return response.json();
};

const needsTimeSeries = (chartType: ChartType | null): boolean =>
  chartType === ChartType.LineChart || chartType === ChartType.BarChart;

const getDefaultTimeRange = (): TimeRange => ({
  column: "start_time",
  from: "{start_time:DateTime64}",
  to: "{end_time:DateTime64}",
  fillGaps: true,
  intervalValue: "1",
  intervalUnit: "{interval_unit:String}",
});

export const Form = ({}: { isLoading: boolean }) => {
  const { projectId } = useParams();
  const router = useRouter();
  const { control, formState, getValues, handleSubmit } = useFormContext<VisualQueryBuilderForm>();

  const { chart, setName, setQuery, setChartConfig, executeQuery, isLoading, error, data } =
    useDashboardEditorStoreContext((state) => ({
      chart: state.chart,
      setName: state.setName,
      setQuery: state.setQuery,
      setChartConfig: state.setChartConfig,
      executeQuery: state.executeQuery,
      isLoading: state.isLoading,
      error: state.error,
      data: state.data,
    }));

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const formValues = useWatch({ control });

  const columns: ColumnInfo[] = useMemo(() => transformDataToColumns(data), [data]);

  const chartConfig = useMemo(() => {
    const { chartType, metrics, dimensions } = formValues;

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
  }, [formValues, columns]);

  const handleSaveChart = async () => {
    if (!chartConfig || !projectId || !chart.name.trim()) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const chartData = {
        name: chart.name,
        query: chart.query,
        config: chart.settings.config,
      };

      if (chart.id) {
        await updateChartViaApi(projectId as string, chart.id, chartData);
      } else {
        await createChartViaApi(projectId as string, chartData);
      }

      router.push(`/project/${projectId}/dashboard`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save chart";
      setSaveError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const updateStore = useCallback(async () => {
    if (!formState.isValid || !projectId) {
      return;
    }

    const { chartType, table, metrics, dimensions, filters, orderBy, limit } = getValues();

    try {
      const isHorizontalBar = chartType === ChartType.HorizontalBarChart;
      const allFilters = [...(filters || [])];

      if (isHorizontalBar) {
        allFilters.push(
          { field: "start_time", op: "gte" as const, value: "{start_time:DateTime64}" },
          { field: "start_time", op: "lte" as const, value: "{end_time:DateTime64}" }
        );
      }

      const queryStructure: QueryStructure = {
        table,
        metrics,
        dimensions: dimensions || [],
        filters: allFilters,
        ...(orderBy && orderBy.length > 0 && { orderBy }),
        limit,
      };

      if (needsTimeSeries(chartType)) {
        queryStructure.timeRange = getDefaultTimeRange();
      }

      const sqlResponse = await fetch(`/api/projects/${projectId}/sql/from-json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonStructure: JSON.stringify(queryStructure) }),
      });

      const sqlData = await sqlResponse.json();

      if (!sqlResponse.ok || !sqlData.success) {
        throw new Error(sqlData.error || "Failed to convert query structure to SQL");
      }

      setQuery(sqlData.sql);

      if (chartConfig) {
        setChartConfig({
          type: chartConfig.type!,
          x: chartConfig.x!,
          y: chartConfig.y!,
          breakdown: chartConfig.breakdown,
          total: chartConfig.total,
        });
      }
    } catch (err) {
      console.error("Failed to update store:", err);
    }
  }, [formState.isValid, projectId, getValues, setQuery, setChartConfig]);

  useEffect(() => {
    const debouncedUpdate = debounce(() => {
      if (formState.isValid) {
        handleSubmit(updateStore)();
      }
    }, 300);

    debouncedUpdate();

    return () => {
      debouncedUpdate.cancel();
    };
  }, [formValues, formState.isValid, updateStore, handleSubmit]);

  useEffect(() => {
    if (chart.query && projectId) {
      executeQuery(projectId as string);
    }
  }, [chart.query, executeQuery, projectId]);

  return (
    <div className="grid grid-cols-4 h-full gap-4 overflow-hidden">
      <QueryBuilderFields />
      <div className="col-span-3 flex flex-col gap-4">
        <div className="flex items-end gap-4 border-b pb-4">
          <div className="flex-1 grid gap-1">
            <Label className="text-xs text-secondary-foreground/80">Chart Name</Label>
            <Input value={chart.name} onChange={(e) => setName(e.target.value)} placeholder="Enter chart name..." />
          </div>
          <Button
            onClick={handleSaveChart}
            disabled={!formState.isValid || !chart.name.trim() || isSaving || !chartConfig}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : chart.id ? "Update Chart" : "Save Chart"}
          </Button>
        </div>

        {saveError && <div className="text-sm text-destructive">{saveError}</div>}

        <div className="flex items-center gap-4">
          <div className="grid gap-1">
            <Label className="text-xs text-secondary-foreground/80">Time range</Label>
            <DateRangeFilter buttonDisabled className="w-fit" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-secondary-foreground/80">Group by</Label>
            <Select value="30 minutes">
              <SelectTrigger className="w-fit text-secondary-foreground" disabled>
                <SelectValue placeholder="select group by">30 minutes</SelectValue>
              </SelectTrigger>
            </Select>
          </div>
        </div>
        <div className="flex flex-col justify-center items-center w-full h-96 p-4 self-center border rounded border-dashed bg-secondary">
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
          ) : chartConfig ? (
            <div className="w-full h-full">
              <ChartRendererCore config={chartConfig} data={data} columns={columns} />
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
