import { isNil, mean } from "lodash";

import { type ChartConfig } from "@/components/ui/chart";

// Series colors, assigned by position and wrapping past the last.
const CHART_PALETTE_SIZE = 20;

const CHART_PALETTE = Array.from({ length: CHART_PALETTE_SIZE }, (_, i) => `hsl(var(--chart-${i + 1}))`);

export const generateChartConfig = (columns: string[], palette: string[] = CHART_PALETTE): ChartConfig =>
  columns.reduce((config, columnName, index) => {
    config[columnName] = {
      label: columnName,
      color: palette[index % palette.length],
    };
    return config;
  }, {} as ChartConfig);

export const calculateDataMax = (data: Record<string, any>[], yColumns: string[]): number =>
  data.reduce((max, d) => {
    const values = yColumns.map((colName) => Number(d[colName])).filter((value) => !isNaN(value));
    return Math.max(max, ...values);
  }, 0);

const createChartConfig = (columns: string[], palette: string[] = CHART_PALETTE): ChartConfig =>
  Object.fromEntries(
    columns.map((column, index) => [
      column,
      {
        color: palette[index % palette.length],
        label: column,
        stackId: "stack",
      },
    ])
  );

/** Series label for rows whose breakdown column is empty or null. */
export const EMPTY_BREAKDOWN = "(none)";

export const transformDataForBreakdown = (
  data: Record<string, any>[],
  xColumn: string,
  yColumn: string,
  breakdownColumn: string
) => {
  const groupedByX = new Map<string, Record<string, any>>();
  const allBreakdownValues = new Set<string>();

  data.forEach((row) => {
    const xValue = String(row[xColumn]);
    const yValue = Number(row[yColumn]) || 0;
    const rawBreakdown = row[breakdownColumn];
    const isEmptyBreakdown = isNil(rawBreakdown) || String(rawBreakdown) === "";

    if (!groupedByX.has(xValue)) {
      groupedByX.set(xValue, { ...row });
    }

    // WITH FILL gap rows carry an empty breakdown and a zero value: they keep the x bucket but are
    // not a series. Real rows with an empty value still count, under EMPTY_BREAKDOWN.
    if (isEmptyBreakdown && yValue === 0) return;

    const breakdownValue = isEmptyBreakdown ? EMPTY_BREAKDOWN : String(rawBreakdown);
    allBreakdownValues.add(breakdownValue);
    groupedByX.get(xValue)![breakdownValue] = yValue;
  });

  const breakdownValues = Array.from(allBreakdownValues);

  const chartData = Array.from(groupedByX.entries()).map(([xValue, group]) => ({
    ...group,
    [xColumn]: xValue,
    ...Object.fromEntries(breakdownValues.map((value) => [value, group[value] ?? 0])),
  }));

  return {
    chartData,
    keys: new Set(breakdownValues),
    chartConfig: createChartConfig(breakdownValues),
  };
};

// A lone series has nothing to tell apart, so its color is set on its own instead of taken from the palette.
export const SINGLE_LINE_PALETTE = ["hsl(var(--chart-1))"];
export const SINGLE_BAR_PALETTE = ["hsl(var(--chart-1))"];

export const transformDataForSimpleChart = (
  data: Record<string, any>[],
  xColumn: string,
  yColumns: string[],
  palette?: string[]
) => {
  const filteredYColumns = yColumns.filter((column) => column && !isNil(column));

  return {
    chartData: data,
    keys: new Set(filteredYColumns),
    chartConfig: createChartConfig(filteredYColumns, palette),
  };
};

export type DisplayValueResult = {
  displayValue: number | null;
  totalMax: number;
};

export const calculateDisplayValue = (
  data: Record<string, any>[],
  keys: string[],
  displayMode: string
): DisplayValueResult => {
  if (displayMode === "none") return { displayValue: null, totalMax: calculateDataMax(data, keys) };

  const totalMax = calculateDataMax(data, keys);

  if (displayMode === "total") {
    const totalSum = data.reduce(
      (sum, row) => sum + keys.reduce((keySum, key) => keySum + (Number(row[key]) || 0), 0),
      0
    );
    return { displayValue: totalSum, totalMax };
  }

  if (displayMode === "average") {
    const values = data.flatMap((row) => keys.map((key) => Number(row[key]) || 0)).filter((v) => v !== 0);
    return { displayValue: values.length > 0 ? mean(values) : 0, totalMax };
  }

  return { displayValue: null, totalMax };
};
