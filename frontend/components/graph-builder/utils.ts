import { GraphType } from "./types";

export interface ColumnInfo {
  name: string;
  type: "string" | "number" | "boolean";
  isXAxis: boolean;
  isYAxis: boolean;
  isBreakdown: boolean;
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
      isXAxis: false,
      isYAxis: false,
      isBreakdown: false,
    };
  });
};

export const canSelectForYAxis = (column: ColumnInfo, graphType: GraphType | string | undefined): boolean => {
  if (graphType === GraphType.HorizontalBarGraph) {
    return true;
  }
  return column.type !== "string";
};

export const isValidGraphConfiguration = (
  graphType: GraphType | string | undefined,
  columns: ColumnInfo[]
): boolean => {
  const xColumn = columns.find((col) => col.isXAxis);
  const yColumns = columns.filter((col) => col.isYAxis);

  const hasBasicConfig = !!(graphType && xColumn && yColumns.length > 0);

  if (!hasBasicConfig) return false;

  if (graphType === GraphType.LineGraph) {
    const breakdownColumn = columns.find((col) => col.isBreakdown);
    if (breakdownColumn) {
      return yColumns.length === 1;
    }
  }

  return true;
};
