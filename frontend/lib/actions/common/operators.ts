export enum Operator {
  Eq = "eq",
  Ne = "ne",
  Lt = "lt",
  Gt = "gt",
  Lte = "lte",
  Gte = "gte",
  Includes = "includes",
}

export const STRING_OPERATORS = [Operator.Eq, Operator.Ne] as const;

export const NUMBER_OPERATORS = [
  Operator.Eq,
  Operator.Lt,
  Operator.Gt,
  Operator.Lte,
  Operator.Gte,
  Operator.Ne,
] as const;

export const BOOLEAN_OPERATORS = [Operator.Eq, Operator.Ne] as const;

export const JSON_OPERATORS = [Operator.Eq] as const;

export const ARRAY_OPERATORS = [Operator.Includes] as const;
