export enum Operator {
  Eq = "eq",
  Ne = "ne",
  Lt = "lt",
  Gt = "gt",
  Lte = "lte",
  Gte = "gte",
  Includes = "includes",
  /// True only when NONE of the listed items are present.
  NotIncludes = "not_includes",
  /// String emptiness test; the value is one of `EMPTINESS_VALUES`. Only offered on
  /// columns marked `emptiable`, whose builders handle it (`createStringFilter`).
  Is = "is",
}

export const EMPTINESS_VALUES = ["empty", "not_empty"] as const;
export type EmptinessValue = (typeof EMPTINESS_VALUES)[number];
export const EMPTINESS_OPTIONS: { value: EmptinessValue; label: string }[] = [
  { value: "empty", label: "empty" },
  { value: "not_empty", label: "not empty" },
];

/** The value a filter should take when its operator changes: `is` has its own value set. */
export const valueForOperator = (operator: Operator, previous: Operator, value: string): string => {
  if (operator === Operator.Is) return previous === Operator.Is ? value : "empty";
  return previous === Operator.Is ? "" : value;
};

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

export const ARRAY_OPERATORS = [Operator.Includes, Operator.NotIncludes] as const;
