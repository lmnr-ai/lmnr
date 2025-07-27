import { ColumnInfo } from "@/components/graph-builder/utils";
import { ChartConfig } from "@/components/ui/chart";

export const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const chartColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export const generateChartConfig = (yColumns: ColumnInfo[]): ChartConfig =>
  yColumns.reduce((config, column, index) => {
    config[column.name] = {
      label: column.name,
      color: chartColors[index % chartColors.length],
    };
    return config;
  }, {} as ChartConfig);

export const calculateDataMax = (data: Record<string, any>[], yColumns: ColumnInfo[]): number =>
  data.reduce((max, d) => {
    const values = yColumns.map((col) => Number(d[col.name])).filter((value) => !isNaN(value));
    return Math.max(max, ...values);
  }, 0);

export const getChartMargins = () => ({
  left: 8,
  right: 8,
  top: 8,
  bottom: 8,
});
