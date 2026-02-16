import { eq, gt, gte, lt, lte, ne, type SQL } from "drizzle-orm";
import { z } from "zod/v4";

import { ARRAY_OPERATORS, BOOLEAN_OPERATORS, JSON_OPERATORS, NUMBER_OPERATORS, STRING_OPERATORS } from "./operators";

const BaseFilterSchema = z.object({
  column: z.string(),
  value: z.union([z.string().min(1), z.number()]),
});

const BaseFilterSchemaRelaxed = z.object({
  column: z.string(),
  value: z.union([z.string(), z.number()]),
});

export const StringFilterSchema = BaseFilterSchema.extend({
  operator: z.enum(STRING_OPERATORS),
});

export const NumberFilterSchema = BaseFilterSchema.extend({
  operator: z.enum(NUMBER_OPERATORS),
});

export const BooleanFilterSchema = BaseFilterSchema.extend({
  operator: z.enum(BOOLEAN_OPERATORS),
});

export const JsonFilterSchema = BaseFilterSchema.extend({
  operator: z.enum(JSON_OPERATORS),
});

export const ArrayFilterSchema = BaseFilterSchema.extend({
  operator: z.enum(ARRAY_OPERATORS),
});

export const FilterSchema = z.union([
  StringFilterSchema,
  NumberFilterSchema,
  BooleanFilterSchema,
  JsonFilterSchema,
  ArrayFilterSchema,
]);

export const FilterSchemaRelaxed = z.union([
  BaseFilterSchemaRelaxed.extend({ operator: z.enum(STRING_OPERATORS) }),
  BaseFilterSchemaRelaxed.extend({ operator: z.enum(NUMBER_OPERATORS) }),
  BaseFilterSchemaRelaxed.extend({ operator: z.enum(BOOLEAN_OPERATORS) }),
  BaseFilterSchemaRelaxed.extend({ operator: z.enum(JSON_OPERATORS) }),
  BaseFilterSchemaRelaxed.extend({ operator: z.enum(ARRAY_OPERATORS) }),
]);

export type Filter = z.infer<typeof FilterSchema>;

export type StringFilter = z.infer<typeof StringFilterSchema>;
export type NumberFilter = z.infer<typeof NumberFilterSchema>;
export type BooleanFilter = z.infer<typeof BooleanFilterSchema>;
export type JsonFilter = z.infer<typeof JsonFilterSchema>;
export type ArrayFilter = z.infer<typeof ArrayFilterSchema>;

type OperatorHandler<TFilter> = (column: any, filter: TFilter) => SQL<unknown>;

const stringOperators: Record<StringFilter["operator"], OperatorHandler<StringFilter>> = {
  eq: (col, filter) => eq(col, filter.value),
  ne: (col, filter) => ne(col, filter.value),
};

const numberOperators: Record<NumberFilter["operator"], OperatorHandler<NumberFilter>> = {
  eq: (col, filter) => eq(col, Number(filter.value)),
  ne: (col, filter) => ne(col, Number(filter.value)),
  gt: (col, filter) => gt(col, Number(filter.value)),
  gte: (col, filter) => gte(col, Number(filter.value)),
  lt: (col, filter) => lt(col, Number(filter.value)),
  lte: (col, filter) => lte(col, Number(filter.value)),
};

const booleanOperators: Record<BooleanFilter["operator"], OperatorHandler<BooleanFilter>> = {
  eq: (col, filter) => eq(col, String(filter.value) === "true"),
  ne: (col, filter) => ne(col, String(filter.value) !== "true"),
};

const jsonOperators: Record<JsonFilter["operator"], OperatorHandler<JsonFilter>> = {
  eq: (col, filter) => eq(col, filter.value),
};

type StringColumnConfig = {
  readonly type: "string";
  readonly column: any;
};

type NumberColumnConfig = {
  readonly type: "number";
  readonly column: any;
};

type BooleanColumnConfig = {
  readonly type: "boolean";
  readonly column: any;
};

type JsonColumnConfig = {
  readonly type: "json";
  readonly column: any;
};

type CustomColumnConfig = {
  readonly type: "custom";
  readonly handler: (filter: Filter) => SQL<unknown> | null;
};

type ColumnConfig =
  | StringColumnConfig
  | NumberColumnConfig
  | BooleanColumnConfig
  | JsonColumnConfig
  | CustomColumnConfig;

type FilterConfig = Readonly<Record<string, ColumnConfig>>;

export function parseFilters(filters: Filter[], config: FilterConfig): SQL<unknown>[] {
  return filters.reduce<SQL<unknown>[]>((conditions, filter) => {
    const columnConfig = config[filter.column];

    if (!columnConfig) {
      return conditions;
    }

    const condition = buildCondition(filter, columnConfig);

    return condition ? [...conditions, condition] : conditions;
  }, []);
}

function buildCondition(filter: Filter, config: ColumnConfig): SQL<unknown> | null {
  if (config.type === "custom") {
    return config.handler(filter);
  }

  if (config.type === "string" && filter.operator in stringOperators) {
    return stringOperators[filter.operator as StringFilter["operator"]](config.column, filter as StringFilter);
  }

  if (config.type === "number" && filter.operator in numberOperators) {
    return numberOperators[filter.operator as NumberFilter["operator"]](config.column, filter as NumberFilter);
  }

  if (config.type === "boolean" && filter.operator in booleanOperators) {
    return booleanOperators[filter.operator as BooleanFilter["operator"]](config.column, filter as BooleanFilter);
  }

  if (config.type === "json" && filter.operator in jsonOperators) {
    return jsonOperators[filter.operator as JsonFilter["operator"]](config.column, filter as JsonFilter);
  }

  return null;
}
