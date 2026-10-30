import { z } from "zod/v4";

import { ARRAY_OPERATORS, BOOLEAN_OPERATORS, JSON_OPERATORS, NUMBER_OPERATORS, STRING_OPERATORS } from "./operators";

export type FilterDataType = "string" | "number" | "boolean" | "json" | "array";

const FilterDataTypeSchema = z.enum(["string", "number", "boolean", "json", "array"]);

const BaseFilterSchema = z.object({
  dataType: FilterDataTypeSchema.optional(),
  column: z.string(),
  value: z.union([z.string().min(1), z.number()]),
});

const BaseFilterSchemaRelaxed = z.object({
  dataType: FilterDataTypeSchema.optional(),
  column: z.string(),
  value: z.union([z.string(), z.number()]),
});

const StringFilterSchema = BaseFilterSchema.extend({
  operator: z.enum(STRING_OPERATORS),
});

const NumberFilterSchema = BaseFilterSchema.extend({
  operator: z.enum(NUMBER_OPERATORS),
});

const BooleanFilterSchema = BaseFilterSchema.extend({
  operator: z.enum(BOOLEAN_OPERATORS),
});

const JsonFilterSchema = BaseFilterSchema.extend({
  operator: z.enum(JSON_OPERATORS),
});

const ArrayFilterSchema = z.object({
  dataType: FilterDataTypeSchema.optional(),
  column: z.string(),
  value: z.array(z.string().min(1)).min(1),
  operator: z.enum(ARRAY_OPERATORS),
});

const ArrayFilterSchemaRelaxed = z.object({
  dataType: FilterDataTypeSchema.optional(),
  column: z.string(),
  value: z.array(z.string()),
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
  ArrayFilterSchemaRelaxed,
]);

export type Filter = z.infer<typeof FilterSchema>;
export type StringFilter = z.infer<typeof StringFilterSchema>;
export type NumberFilter = z.infer<typeof NumberFilterSchema>;
export type BooleanFilter = z.infer<typeof BooleanFilterSchema>;
export type JsonFilter = z.infer<typeof JsonFilterSchema>;
