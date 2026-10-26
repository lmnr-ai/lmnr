"use client";

import { useMemo } from "react";

import ColumnSelect from "@/components/chart-builder/column-select";
import { ChartType } from "@/components/chart-builder/types";
import { canSelectForXAxis, canSelectForYAxis, transformDataToColumns } from "@/components/chart-builder/utils";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import FreeformSqlField from "@/components/dashboards/editor/freeform-sql-field";
import { needsTimeSeries } from "@/components/dashboards/editor/utils";

interface FreeformFieldsProps {
  onRun: () => void;
  canRun: boolean;
  issue: string | null;
}

/** Advanced mode's query fields: the SQL itself and which result columns to plot. */
export default function FreeformFields({ onRun, canRun, issue }: FreeformFieldsProps) {
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
      <FreeformSqlField onRun={onRun} canRun={canRun} issue={issue} />
      {config.type !== ChartType.Table && (
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
