import { type ReactNode } from "react";

import { type FilterDataType } from "@/lib/actions/common/filter-schemas";
import {
  ARRAY_OPERATORS,
  BOOLEAN_OPERATORS,
  JSON_OPERATORS,
  NUMBER_OPERATORS,
  Operator,
  STRING_OPERATORS,
} from "@/lib/actions/common/operators";

export type ColumnFilter = ColumnFilterPrimitives | ColumnFilterEnum;
type ColumnFilterPrimitives = {
  name: string;
  key: string;
  dataType: "string" | "number" | "json" | "boolean" | "array";
  /// Offers the `is empty` / `is not empty` operator. Only set it on string columns whose
  /// table builds filters with `createStringFilter`, which knows how to run it.
  emptiable?: boolean;
};
type ColumnFilterEnum = {
  name: string;
  key: string;
  dataType: "enum";
  options: { label: string; value: string; icon?: ReactNode }[];
};

export const OperatorLabelMap: Record<Operator, string> = {
  [Operator.Eq]: "=",
  [Operator.Lt]: "<",
  [Operator.Gt]: ">",
  [Operator.Lte]: "<=",
  [Operator.Gte]: ">=",
  [Operator.Ne]: "!=",
  [Operator.Includes]: "includes",
  [Operator.NotIncludes]: "not includes",
  [Operator.Is]: "is",
};

export const STRING_OPERATIONS = STRING_OPERATORS.map((op) => ({
  key: op,
  label: OperatorLabelMap[op],
}));

export const NUMBER_OPERATIONS = NUMBER_OPERATORS.map((op) => ({
  key: op,
  label: OperatorLabelMap[op],
}));

export const JSON_OPERATIONS = JSON_OPERATORS.map((op) => ({
  key: op,
  label: OperatorLabelMap[op],
}));

export const BOOLEAN_OPERATIONS = BOOLEAN_OPERATORS.map((op) => ({
  key: op,
  label: OperatorLabelMap[op],
}));

const ARRAY_OPERATIONS = ARRAY_OPERATORS.map((op) => ({
  key: op,
  label: OperatorLabelMap[op],
}));

export const dataTypeOperationsMap: Record<ColumnFilter["dataType"], { key: Operator; label: string }[]> = {
  string: STRING_OPERATIONS,
  number: NUMBER_OPERATIONS,
  json: JSON_OPERATIONS,
  boolean: BOOLEAN_OPERATIONS,
  enum: STRING_OPERATIONS,
  array: ARRAY_OPERATIONS,
};

const IS_OPERATION = { key: Operator.Is, label: OperatorLabelMap[Operator.Is] };

/** Operators for a column: its data type's, plus `is` when the column is emptiable. */
export const getColumnOperations = (column: ColumnFilter | undefined, fallbackDataType: ColumnFilter["dataType"]) => {
  const operations = dataTypeOperationsMap[column?.dataType ?? fallbackDataType];
  return column && "emptiable" in column && column.emptiable ? [...operations, IS_OPERATION] : operations;
};

/** UI-only dataTypes narrowed to what `FilterSchema` persists. */
export const toFilterDataType = (dataType: ColumnFilter["dataType"]): FilterDataType =>
  dataType === "enum" ? "string" : dataType;
