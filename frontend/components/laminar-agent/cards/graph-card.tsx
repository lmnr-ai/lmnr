"use client";

import { useMemo } from "react";

import { ChartRendererCore } from "@/components/chart-builder/charts";
import { type ChartConfig, ChartType } from "@/components/chart-builder/types";
import { transformDataToColumns } from "@/components/chart-builder/utils";

interface GraphCardProps {
  title: string | null;
  chartType: "line" | "bar" | "horizontalBar";
  xColumn: string;
  yColumn: string;
  data: Record<string, unknown>[];
}

export default function GraphCard({ props }: { props: GraphCardProps }) {
  const { title, chartType, xColumn, yColumn, data } = props;

  const typedData = data as Record<string, string | number | boolean>[];
  const columns = useMemo(() => transformDataToColumns(typedData), [typedData]);

  const chartTypeMap: Record<string, ChartType> = {
    line: ChartType.LineChart,
    bar: ChartType.BarChart,
    horizontalBar: ChartType.HorizontalBarChart,
  };

  const config: ChartConfig = useMemo(
    () => ({
      type: chartTypeMap[chartType] ?? ChartType.LineChart,
      x: xColumn,
      y: yColumn,
    }),
    [chartType, xColumn, yColumn]
  );

  const hasData = data && data.length > 0;

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      {title && (
        <div className="px-4 py-2.5 border-b">
          <span className="font-medium text-sm">{title}</span>
        </div>
      )}
      <div className="p-4 h-64">
        {hasData ? (
          <ChartRendererCore config={config} data={typedData} columns={columns} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No data available</div>
        )}
      </div>
    </div>
  );
}
