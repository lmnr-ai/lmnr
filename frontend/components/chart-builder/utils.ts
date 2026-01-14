import { type ChartConfig, ChartType } from "./types";

export interface ColumnInfo {
  name: string;
  type: "string" | "number" | "boolean";
}

export type DataRow = Record<string, string | number | boolean>;

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

export const canSelectForYAxis = (column: ColumnInfo, chartType: ChartType | undefined): boolean => {
  if (chartType === ChartType.HorizontalBarChart) {
    return true;
  }
  return column.type !== "string";
};

export const isValidChartConfiguration = (config: ChartConfig, columns: ColumnInfo[]): boolean => {
  const { type, x, y, breakdown } = config;

  if (!type || !x || !y) return false;

  const xColumn = columns.find((col) => col.name === x);
  const yColumn = columns.find((col) => col.name === y);

  if (!xColumn || !yColumn) return false;

  if (breakdown) {
    const breakdownColumn = columns.find((col) => col.name === breakdown);
    if (!breakdownColumn) return false;
  }

  return true;
};

export const getAvailableBreakdownColumns = (config: ChartConfig, columns: ColumnInfo[]): ColumnInfo[] => {
  const { x, y } = config;
  const usedColumns = new Set([x, y].filter(Boolean));
  return columns.filter((col) => !usedColumns.has(col.name));
};
