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

// `ne` on a JSON key=value filter negates the whole match, so rows that don't
// carry the key at all are included.
export const JSON_OPERATORS = [Operator.Eq, Operator.Ne] as const;

export const ARRAY_OPERATORS = [Operator.Includes, Operator.NotIncludes] as const;
