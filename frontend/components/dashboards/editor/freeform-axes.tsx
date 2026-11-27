"use client";

import { useMemo } from "react";

import ColumnSelect from "@/components/chart-builder/column-select";
import { ChartType } from "@/components/chart-builder/types";
import { canSelectForXAxis, canSelectForYAxis, transformDataToColumns } from "@/components/chart-builder/utils";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { needsTimeSeries } from "@/components/dashboards/editor/utils";

/** Advanced mode's column mappings: which result columns the chosen chart type plots. */
export default function FreeformAxes() {
  const { config, data, setChartConfig } = useDashboardEditorStoreContext((state) => ({
    config: state.chart.settings.config,
    data: state.data,
    setChartConfig: state.setChartConfig,
  }));
  const columns = useMemo(() => transformDataToColumns(data), [data]);
  const isHorizontal = config.type === ChartType.HorizontalBarChart;
  const setAxis = (axis: "x" | "y" | "breakdown") => (column?: string) => setChartConfig({ ...config, [axis]: column });

  return (
    <>
      {config.type === ChartType.Value && (
        <ColumnSelect
          label="Value"
          columns={columns}
          // Unset or missing from the result, the renderer shows the first column; show that one picked.
          value={columns.some((column) => column.name === config.y) ? config.y : columns[0]?.name}
          onChange={setAxis("y")}
          info="Shown from the first row. A number gets formatted; text is shown as written."
        />
      )}
      {config.type !== ChartType.Table && config.type !== ChartType.Value && (
        <>
          <ColumnSelect
            label={isHorizontal ? "Value" : "X axis"}
            columns={columns.filter((column) => canSelectForXAxis(column, config.type))}
            value={config.x}
            onChange={setAxis("x")}
          />
          <ColumnSelect
            label={isHorizontal ? "Category" : "Y axis"}
            columns={columns.filter((column) => canSelectForYAxis(column, config.type))}
            value={config.y}
            onChange={setAxis("y")}
          />
          {/* Dashboard line and bar charts both split by breakdown (bars stack), as Standard's Group By does. */}
          {needsTimeSeries(config.type) && (
            <ColumnSelect
              label="Break down by"
              columns={columns.filter((column) => column.name !== config.x && column.name !== config.y)}
              value={config.breakdown}
              onChange={setAxis("breakdown")}
              noneLabel="None (single series)"
              info="One series per value of this column. Use when grouping by more than the X axis."
            />
          )}
        </>
      )}
    </>
  );
}
