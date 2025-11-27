import { ReactNode } from "react";

import { BOOLEAN_OPERATORS, JSON_OPERATORS, NUMBER_OPERATORS, Operator, STRING_OPERATORS } from "@/lib/actions/common/operators";

export type ColumnFilter = ColumnFilterPrimitives | ColumnFilterEnum;
type ColumnFilterPrimitives = { name: string; key: string; dataType: "string" | "number" | "json" | "boolean" };
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

export const dataTypeOperationsMap: Record<ColumnFilter["dataType"], { key: Operator; label: string }[]> = {
  string: STRING_OPERATIONS,
  number: NUMBER_OPERATIONS,
  json: JSON_OPERATIONS,
  boolean: BOOLEAN_OPERATIONS,
  enum: STRING_OPERATIONS,
};
