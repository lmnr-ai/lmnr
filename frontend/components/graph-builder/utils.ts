import { ChartConfig, GraphType } from "./types";

export interface ColumnInfo {
  name: string;
  type: "string" | "number" | "boolean";
}

export type DataRow = Record<string, string | number | boolean>;

export const generateSampleTimeData = (originalData: DataRow[]): DataRow[] => {
  if (originalData.length === 0) return [];

  const dataPointCount = originalData.length;
  const now = new Date();
  const sampleDates = Array.from({ length: dataPointCount }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (dataPointCount - 1 - i));
    return date.toISOString().split("T")[0];
  });

  return originalData.map((row, index) => ({
    timestamp: sampleDates[index],
    ...row,
  }));
};

export const transformDataToColumns = (data: DataRow[]): ColumnInfo[] => {
  if (!data || data.length === 0) return [];

  const firstRow = data[0];
  return Object.keys(firstRow).map((key) => {
    const value = firstRow[key];
    let type: "string" | "number" | "boolean";

    if (typeof value === "number") {
      type = "number";
    } else if (typeof value === "boolean") {
      type = "boolean";
    } else {
      type = "string";
    }

    return {
      name: key,
      type,
    };
  });
};

export const canSelectForYAxis = (column: ColumnInfo, graphType: GraphType | undefined): boolean => {
  if (graphType === GraphType.HorizontalBarGraph) {
    return true;
  }
  return column.type !== "string";
};

export const isValidGraphConfiguration = (
  config: ChartConfig,
  columns: ColumnInfo[]
): boolean => {
  const { type, x, y, breakdown } = config;

  // Basic validation
  if (!type || !x || y.length === 0) return false;

  // Check if selected columns exist
  const xColumn = columns.find((col) => col.name === x);
  const yColumns = y.map(yName => columns.find((col) => col.name === yName)).filter(Boolean);

  if (!xColumn || yColumns.length !== y.length) return false;

  // Line graph with breakdown requires exactly one Y column
  if (type === GraphType.LineGraph && breakdown && y.length > 1) {
    return false;
  }

  // Check if breakdown column exists (if specified)
  if (breakdown) {
    const breakdownColumn = columns.find((col) => col.name === breakdown);
    if (!breakdownColumn) return false;
  }

  return true;
};

export const getAvailableBreakdownColumns = (
  config: ChartConfig,
  columns: ColumnInfo[]
): ColumnInfo[] => {
  const { x, y } = config;
  const usedColumns = new Set([x, ...y].filter(Boolean));
  return columns.filter((col) => !usedColumns.has(col.name));
};
