"use client";

import { debounce } from "lodash";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { type ChartConfig, ChartType, resolveDisplayMode } from "@/components/chart-builder/types";
import { type ColumnInfo, transformDataToColumns } from "@/components/chart-builder/utils";
import ChartPreviewContent from "@/components/dashboards/editor/chart-preview-content";
import ChartPreviewPane from "@/components/dashboards/editor/chart-preview-pane";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import EditorSidebar from "@/components/dashboards/editor/editor-sidebar";
import { QueryBuilderFields } from "@/components/dashboards/editor/fields";
import FreeformForm from "@/components/dashboards/editor/freeform-form";
import { getTimeColumn } from "@/components/dashboards/editor/table-schemas";
import {
  getDefaultTimeRange,
  injectIdMetrics,
  needsTimeSeries,
  savedHorizontalBarAxes,
} from "@/components/dashboards/editor/utils";
import { toTimeParameters, useDashboardTimeRange } from "@/components/dashboards/time-range";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type QueryStructure } from "@/lib/actions/sql/types.ts";

// The SQL editor needs more room than the visual builder's fields.
const SIDEBAR_WIDTH = { visual: 320, sql: 420 };

export const Form = ({ isLoadingChart }: { isLoadingChart: boolean }) => {
  const editorMode = useDashboardEditorStoreContext((state) => state.editorMode);
  const sidebarWidth = editorMode === "sql" ? SIDEBAR_WIDTH.sql : SIDEBAR_WIDTH.visual;

  // The grid outlives the mode switch (each form only renders its two grid items), so the
  // column change transitions instead of remounting at the new width.
  return (
    <div
      className="grid h-full gap-4 overflow-hidden transition-[grid-template-columns] duration-300 ease-out"
      style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)` }}
    >
      {editorMode === "sql" ? <FreeformForm /> : <VisualForm isLoadingChart={isLoadingChart} />}
    </div>
  );
};

const VisualForm = ({ isLoadingChart }: { isLoadingChart: boolean }) => {
  const { projectId } = useParams();
  const { control, formState, getValues, handleSubmit } = useFormContext<QueryStructure>();

  const timeRange = useDashboardTimeRange();
  const { chart, setQuery, setChartConfig, executeQuery, data, setLoading, setError } = useDashboardEditorStoreContext(
    (state) => ({
      chart: state.chart,
      setQuery: state.setQuery,
      setChartConfig: state.setChartConfig,
      executeQuery: state.executeQuery,
      data: state.data,
      setLoading: state.setLoading,
      setError: state.setError,
    })
  );

  const formValues = useWatch({ control });

  // Ref to the latest chart so generateAndExecuteQuery reads fresh tableColumnConfig
  // without re-creating the callback on every column reorder/resize (which would
  // re-trigger the debounced query execution).
  const chartRef = useRef(chart);
  useEffect(() => {
    chartRef.current = chart;
  }, [chart]);

  const columns: ColumnInfo[] = useMemo(() => transformDataToColumns(data), [data]);

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

    // Read through the ref: this memo feeds setChartConfig, so depending on the saved axes would loop.
    const savedAxes = savedHorizontalBarAxes(
      { ...chartRef.current.settings.config, type: chartType },
      metrics.filter((m) => !!m),
      dimensions
    );
    if (savedAxes) {
      return { type: chartType, ...savedAxes, breakdown: undefined, displayMode: "none" as const };
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

      await executeQuery(projectId as string, toTimeParameters(timeRange));
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
    timeRange,
  ]);

  // Single debounced effect that re-executes when form values or the URL's time range
  // (through generateAndExecuteQuery) change.
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
    <>
      <ScrollArea className="border rounded bg-secondary relative">
        <EditorSidebar saveDisabled={!formState.isValid || !chartConfig}>
          <QueryBuilderFields />
        </EditorSidebar>
        {isLoadingChart && (
          <div className="absolute inset-0 bg-background/40 z-20 backdrop-blur-xs flex items-center justify-center rounded">
            <div className="flex flex-col items-center space-y-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          </div>
        )}
      </ScrollArea>
      <ChartPreviewPane name={chart.name}>
        <ChartPreviewContent config={chartConfigForRendering} hiddenColumns={hiddenColumns} />
      </ChartPreviewPane>
    </>
  );
};
