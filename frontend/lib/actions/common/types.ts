import { z } from "zod/v4";

import { FilterSchema } from "./filters";

export { FilterSchema };

export const FiltersSchema = z.object({
  filter: z
    .array(z.string())
    .default([])
    .transform((filters, ctx) =>
      filters
        .map((filter) => {
          try {
            const parsed = JSON.parse(filter);
            return FilterSchema.parse(parsed);
          } catch (error) {
            ctx.issues.push({
              code: "custom",
              message: `Invalid filter JSON: ${filter}`,
              input: filter,
            });
            return undefined;
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== undefined)
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
