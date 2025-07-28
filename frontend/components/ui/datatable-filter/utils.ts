import { ReactNode } from "react";

export type ColumnFilter = ColumnFilterPrimitives | ColumnFilterEnum;
type ColumnFilterPrimitives = { name: string; key: string; dataType: "string" | "number" | "json" };
type ColumnFilterEnum = {
  name: string;
  key: string;
  dataType: "enum";
  options: { label: string; value: string; icon?: ReactNode }[];
};

export enum Operator {
  Eq = "eq",
  Lt = "lt",
  Gt = "gt",
  Lte = "lte",
  Gte = "gte",
  Ne = "ne",
}

export const OperatorLabelMap: Record<Operator, string> = {
  [Operator.Eq]: "=",
  [Operator.Lt]: "<",
  [Operator.Gt]: ">",
  [Operator.Lte]: "<=",
  [Operator.Gte]: ">=",
  [Operator.Ne]: "!=",
};

const STRING_OPERATORS = [Operator.Eq, Operator.Ne];
const NUMBER_OPERATORS = [Operator.Eq, Operator.Lt, Operator.Gt, Operator.Lte, Operator.Gte, Operator.Ne];
const JSON_OPERATORS = [Operator.Eq];

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

export const dataTypeOperationsMap: Record<ColumnFilter["dataType"], { key: Operator; label: string }[]> = {
  string: STRING_OPERATIONS,
  number: NUMBER_OPERATIONS,
  json: JSON_OPERATIONS,
  enum: STRING_OPERATIONS,
};

export type DatatableFilter = {
  column: string;
  operator: Operator;
  value: string;
};
