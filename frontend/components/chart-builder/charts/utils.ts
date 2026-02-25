import { scaleTime, scaleUtc } from "d3-scale";
import { format, isValid, parseISO } from "date-fns";
import { isNil } from "lodash";

import { type ChartConfig } from "@/components/ui/chart";

export const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 3,
});

const chartColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const tryFormatAsDate = (value: string | number | Date, formatPattern: string = "M/dd"): string => {
  try {
    const date =
      value instanceof Date
        ? value
        : typeof value === "string"
          ? parseISO(value.includes("T") && !value.endsWith("Z") ? value + "Z" : value)
          : typeof value === "number"
            ? new Date(value)
            : null;

    return date && isValid(date) ? format(date, formatPattern) : String(value);
  } catch {
    return String(value);
  }
};

const getOptimalDateFormat = (data: Record<string, unknown>[], dataKey: string): string => {
  try {
    const dates = data
      .map((row) => {
        try {
          const value = row[dataKey];
          if (typeof value === "string" && value.includes("T")) {
            return parseISO(value);
          }
          return new Date(value as string | number | Date);
        } catch {
          return null;
        }
      })
      .filter((date) => date && isValid(date)) as Date[];

    if (dates.length < 2) return "M/dd HH:mm";

    const timeDifferences = dates
      .sort((a, b) => a.getTime() - b.getTime())
      .slice(1)
      .map((date, index) => date.getTime() - dates[index].getTime());

    const medianDiff = timeDifferences.sort((a, b) => a - b)[Math.floor(timeDifferences.length / 2)];

    const medianDiffHours = medianDiff / (1000 * 60 * 60);

    return medianDiffHours > 6 ? "M/dd" : "HH:mm";
  } catch {
    return "M/dd";
  }
};

export const createAxisFormatter = (data: Record<string, unknown>[], dataKey: string) => {
  const dateFormat = getOptimalDateFormat(data, dataKey);

  return (value: string | number | Date) => {
    if (typeof value === "number") {
      return numberFormatter.format(value);
    }

    if (typeof value === "string" || value instanceof Date) {
      const dateFormatted = tryFormatAsDate(value, dateFormat);
      if (dateFormatted !== value) {
        return dateFormatted;
      }
    }

    return String(value);
  };
};

export const parseUtcTimestamp = (s: string): Date => {
  if (s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  return new Date(normalized + "Z");
};

export const selectNiceTicksFromData = (
  dataTimestamps: string[],
  targetTickCount: number = 8
): { ticks: string[]; formatter: (value: string) => string } | null => {
  if (dataTimestamps.length === 0) return null;

  const startDate = parseUtcTimestamp(dataTimestamps[0]);
  const endDate = parseUtcTimestamp(dataTimestamps[dataTimestamps.length - 1]);

  if (!isValid(startDate) || !isValid(endDate)) return null;

  const scale = scaleUtc().domain([startDate, endDate]);
  const idealTicks = scale.ticks(targetTickCount);
  const formatTick = scaleTime().domain([startDate, endDate]).tickFormat();

  const findClosestTimestamp = (targetTime: number) =>
    dataTimestamps.reduce((closest, current) => {
      const closestDiff = Math.abs(parseUtcTimestamp(closest).getTime() - targetTime);
      const currentDiff = Math.abs(parseUtcTimestamp(current).getTime() - targetTime);
      return currentDiff < closestDiff ? current : closest;
    });

  const tickLabels = new Map(idealTicks.map((tick) => [findClosestTimestamp(tick.getTime()), formatTick(tick)]));

  return {
    ticks: Array.from(tickLabels.keys()),
    formatter: (value: string) => tickLabels.get(value) || value,
  };
};

export const generateChartConfig = (columns: string[]): ChartConfig =>
  columns.reduce((config, columnName, index) => {
    config[columnName] = {
      label: columnName,
      color: chartColors[index % chartColors.length],
    };
    return config;
  }, {} as ChartConfig);

export const calculateDataMax = (data: Record<string, any>[], yColumns: string[]): number =>
  data.reduce((max, d) => {
    const values = yColumns.map((colName) => Number(d[colName])).filter((value) => !isNaN(value));
    return Math.max(max, ...values);
  }, 0);

export const getChartMargins = (yAxisValues?: any[], yAxisFormatter?: (value: any) => string) => {
  if (yAxisValues && yAxisFormatter && yAxisValues.length > 0) {
    const formattedValues = yAxisValues.map((value) => yAxisFormatter(value));
    const longestLabel = formattedValues.reduce(
      (longest, current) => (current.length > longest.length ? current : longest),
      ""
    );

    return {
      left: Math.max(4, longestLabel.length * 3),
      right: 0,
      top: 0,
      bottom: 0,
    };
  }

  return {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  };
};

const selectColumnsFromData = (
  data: Record<string, any>[],
  xColumn: string,
  yColumns: string[]
): Record<string, any>[] =>
  data.map((row) => {
    const selectedRow: Record<string, any> = {
      [xColumn]: row[xColumn],
    };
    yColumns.forEach((yColumn) => {
      selectedRow[yColumn] = row[yColumn];
    });
    return selectedRow;
  });

const createChartConfig = (columns: string[]): ChartConfig =>
  Object.fromEntries(
    columns.map((column, index) => [
      column,
      {
        color: `hsl(var(--chart-${(index % 5) + 1}))`,
        label: column,
        stackId: "stack",
      },
    ])
  );

export const transformDataForBreakdown = (
  data: Record<string, any>[],
  xColumn: string,
  yColumn: string,
  breakdownColumn: string
) => {
  const groupedByX = new Map<string, Record<string, number>>();
  const allBreakdownValues = new Set<string>();

  data.forEach((row) => {
    const xValue = String(row[xColumn]);
    const breakdownValue = String(row[breakdownColumn]);
    const yValue = Number(row[yColumn]) || 0;

    if (breakdownValue && !isNil(breakdownValue)) {
      allBreakdownValues.add(breakdownValue);
    }

    if (!groupedByX.has(xValue)) {
      groupedByX.set(xValue, {});
    }

    const xGroup = groupedByX.get(xValue);
    if (xGroup && !isNil(breakdownValue)) {
      xGroup[breakdownValue] = yValue;
    }
  });

  const filteredBreakdownValues = Array.from(allBreakdownValues).filter((value) => value && !isNil(value));

  const chartData = Array.from(groupedByX.entries()).map(([xValue, breakdownGroups]) => ({
    [xColumn]: xValue,
    ...Object.fromEntries(filteredBreakdownValues.map((value) => [value, 0])),
    ...breakdownGroups,
  }));

  return {
    chartData,
    keys: new Set(filteredBreakdownValues),
    chartConfig: createChartConfig(filteredBreakdownValues),
  };
};

export const transformDataForSimpleChart = (data: Record<string, any>[], xColumn: string, yColumns: string[]) => {
  const chartData = selectColumnsFromData(data, xColumn, yColumns);

  const filteredYColumns = yColumns.filter((column) => column && !isNil(column));

  return {
    chartData,
    keys: new Set(filteredYColumns),
    chartConfig: createChartConfig(filteredYColumns),
  };
};

export const calculateChartTotals = (data: Record<string, any>[], keys: string[], showTotal: boolean = false) => {
  if (!showTotal) return { totalSum: 0, totalMax: 0 };

  const totalSum = data.reduce(
    (sum, row) =>
      sum +
      keys.reduce((keySum, key) => {
        const value = Number(row[key]) || 0;
        return keySum + value;
      }, 0),
    0
  );

  const totalMax = calculateDataMax(data, keys);

  return { totalSum, totalMax };
};
