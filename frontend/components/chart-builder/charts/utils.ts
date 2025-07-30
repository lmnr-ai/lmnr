import { format, isValid, parseISO } from "date-fns";

import { ChartConfig } from "@/components/ui/chart";

export const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 3,
});

export const chartColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export const tryFormatAsDate = (value: any, formatPattern: string = "MMM dd"): string => {
  try {
    let date: Date;

    if (value instanceof Date) {
      date = value;
    } else if (typeof value === "string") {
      date = value.includes("T") ? parseISO(value) : new Date(value);
    } else if (typeof value === "number") {
      date = new Date(value);
    } else {
      return String(value);
    }

    if (isValid(date)) {
      return format(date, formatPattern);
    }

    return String(value);
  } catch {
    return String(value);
  }
};

export const getOptimalDateFormat = (data: Record<string, any>[], dataKey: string): string => {
  try {
    const dates = data
      .map((row) => {
        try {
          const value = row[dataKey];
          if (typeof value === "string" && value.includes("T")) {
            return parseISO(value);
          }
          return new Date(value);
        } catch {
          return null;
        }
      })
      .filter((date) => date && isValid(date)) as Date[];

    if (dates.length < 2) return "MMM dd";

    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

    if (minDate.toDateString() === maxDate.toDateString()) {
      return "HH:mm";
    }

    if (minDate.getFullYear() !== maxDate.getFullYear()) {
      return "MMM dd, yyyy";
    }

    return "MMM dd";
  } catch {
    return "MMM dd";
  }
};

export const createAxisFormatter = (data: Record<string, any>[], dataKey: string) => {
  const dateFormat = getOptimalDateFormat(data, dataKey);

  return (value: any) => {
    if (typeof value === "number") {
      return numberFormatter.format(value);
    }

    if (typeof value === "string") {
      const dateFormatted = tryFormatAsDate(value, dateFormat);
      if (dateFormatted !== value) {
        return dateFormatted;
      }
    }

    return String(value);
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
      left: Math.max(12, longestLabel.length * 3),
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

    allBreakdownValues.add(breakdownValue);

    if (!groupedByX.has(xValue)) {
      groupedByX.set(xValue, {});
    }

    const xGroup = groupedByX.get(xValue);
    if (xGroup) {
      xGroup[breakdownValue] = yValue;
    }
  });

  const chartData = Array.from(groupedByX.entries()).map(([xValue, breakdownGroups]) => ({
    [xColumn]: xValue,
    ...Object.fromEntries(Array.from(allBreakdownValues).map((value) => [value, 0])),
    ...breakdownGroups,
  }));

  return {
    chartData,
    keys: allBreakdownValues,
    chartConfig: createChartConfig(Array.from(allBreakdownValues)),
  };
};

export const transformDataForSimpleChart = (data: Record<string, any>[], xColumn: string, yColumns: string[]) => {
  const chartData = selectColumnsFromData(data, xColumn, yColumns);

  return {
    chartData,
    keys: new Set(yColumns),
    chartConfig: createChartConfig(yColumns),
  };
};
