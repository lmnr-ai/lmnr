import { ReactNode } from "react";

export type ColumnFilter = ColumnFilterPrimitives | ColumnFilterEnum;
type ColumnFilterPrimitives = { name: string; key: string; dataType: "string" | "number" | "json" };
type ColumnFilterEnum = {
  name: string;
  key: string;
  dataType: "enum";
  options: { label: string; value: string; icon?: ReactNode }[];
};

export const STRING_OPERATIONS = [
  {
    key: "eq",
    label: "=",
  },
  { key: "ne", label: "!=" },
];
export const NUMBER_OPERATIONS = [
  { key: "eq", label: "=" },
  { key: "lt", label: "<" },
  { key: "gt", label: ">" },
  { key: "lte", label: "<=" },
  { key: "gte", label: ">=" },
  { key: "ne", label: "!=" },
];

export const dataTypes = [
  { label: "Boolean", value: "boolean" },
  { label: "Number", value: "number" },
  { label: "String", value: "string" },
];

export const castToDataType = (value: string, dataType: string) => {
  switch (dataType) {
    case "boolean":
      return value === "true";
    case "number":
      return parseInt(value, 10);
    default:
      return value;
  }
};

export const JSON_OPERATIONS = [{ key: "eq", label: "=" }];

export const dataTypeOperationsMap: Record<ColumnFilter["dataType"], { key: string; label: string }[]> = {
  string: STRING_OPERATIONS,
  number: NUMBER_OPERATIONS,
  json: JSON_OPERATIONS,
  enum: STRING_OPERATIONS,
};

export type DatatableFilter = {
  column: string;
  operator: string;
  value: string;
};
