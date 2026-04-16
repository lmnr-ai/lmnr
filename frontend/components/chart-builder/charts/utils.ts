import { scaleTime } from "d3-scale";
import { format, isValid, parseISO } from "date-fns";
import { isNil, mean } from "lodash";

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

    const sortedDates = dates.sort((a, b) => a.getTime() - b.getTime());

    const timeDifferences = sortedDates.slice(1).map((date, index) => date.getTime() - sortedDates[index].getTime());

    const medianDiff = timeDifferences.sort((a, b) => a - b)[Math.floor(timeDifferences.length / 2)];

    const medianDiffHours = medianDiff / (1000 * 60 * 60);
    const totalSpanHours =
      (sortedDates[sortedDates.length - 1].getTime() - sortedDates[0].getTime()) / (1000 * 60 * 60);

    if (medianDiffHours > 6) {
      return "M/dd";
    }
    // If data points are close together but span more than a day, show both date and time
    if (totalSpanHours > 24) {
      return "M/dd HH:mm";
    }
    return "HH:mm";
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
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(s);
  const hasTime = s.includes("T") || s.includes(" ");
  if (hasTime && !hasTimezone) return new Date(s.replace(" ", "T") + "Z");
  return new Date(s);
};

export const selectNiceTicksFromData = (
  dataTimestamps: string[],
  targetTickCount: number = 8
): { ticks: string[]; formatter: (value: string) => string } | null => {
  if (dataTimestamps.length === 0) return null;

  const startDate = parseUtcTimestamp(dataTimestamps[0]);
  const endDate = parseUtcTimestamp(dataTimestamps[dataTimestamps.length - 1]);

  if (!isValid(startDate) || !isValid(endDate)) return null;

  const scale = scaleTime().domain([startDate, endDate]);
  const idealTicks = scale.ticks(targetTickCount);
  const formatTick = scale.tickFormat();

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
  const groupedByX = new Map<string, Record<string, any>>();
  const allBreakdownValues = new Set<string>();

  data.forEach((row) => {
    const xValue = String(row[xColumn]);
    const breakdownValue = String(row[breakdownColumn]);
    const yValue = Number(row[yColumn]) || 0;

    if (breakdownValue && !isNil(breakdownValue)) {
      allBreakdownValues.add(breakdownValue);
    }

    if (!groupedByX.has(xValue)) {
      groupedByX.set(xValue, { ...row });
    }

    const xGroup = groupedByX.get(xValue);
    if (xGroup && !isNil(breakdownValue)) {
      xGroup[breakdownValue] = yValue;
    }
  });

  const filteredBreakdownValues = Array.from(allBreakdownValues).filter((value) => value && !isNil(value));

  const chartData = Array.from(groupedByX.entries()).map(([xValue, group]) => ({
    ...group,
    [xColumn]: xValue,
    ...Object.fromEntries(filteredBreakdownValues.map((value) => [value, group[value] ?? 0])),
  }));

  return {
    chartData,
    keys: new Set(filteredBreakdownValues),
    chartConfig: createChartConfig(filteredBreakdownValues),
  };
};

export const transformDataForSimpleChart = (data: Record<string, any>[], xColumn: string, yColumns: string[]) => {
  const filteredYColumns = yColumns.filter((column) => column && !isNil(column));

  return {
    chartData: data,
    keys: new Set(filteredYColumns),
    chartConfig: createChartConfig(filteredYColumns),
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

  return { displayValue: null, totalMax: 0 };
};
