import { z } from "zod/v4";

import { Operator } from "@/components/ui/datatable-filter/utils";

export const FilterDefSchema = z.object({
  column: z.string(),
  operator: z.enum(Operator),
  value: z.string(),
});

export const FiltersSchema = z.object({
  filter: z
    .array(z.string())
    .default([])
    .transform((filters, ctx) =>
      filters.map((filter) => {
        try {
          const parsed = JSON.parse(filter);
          return FilterDefSchema.parse(parsed);
        } catch (error) {
          ctx.issues.push({
            code: "custom",
            message: `Invalid filter JSON: ${filter}`,
            input: filter,
          });
        }
      })
    ),
});

export const PaginationSchema = z.object({
  pageNumber: z
    .string()
    .nullable()
    .default("0")
    .transform((val) => Number(val) || 0),
  pageSize: z
    .string()
    .nullable()
    .default("50")
    .transform((val) => Number(val) || 50),
});

export const TimeRangeSchema = z.object({
  pastHours: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const PaginationFiltersSchema = z.object({
  ...FiltersSchema.shape,
  ...PaginationSchema.shape,
});

export type JsonType = { [key: PropertyKey]: JsonType } | null;

export const zJsonString = z
  .string()
  .optional()
  .transform((str, ctx): JsonType => {
    if (!str) {
      return null;
    }
    try {
      return JSON.parse(str);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: "Invalid JSON" });
      return z.NEVER;
    }
  });
