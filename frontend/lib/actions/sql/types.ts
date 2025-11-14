import { z } from "zod/v4";

export const MetricSchema = z
  .object({
    fn: z.enum(["count", "sum", "avg", "min", "max", "quantile"]),
    column: z.string(),
    args: z.array(z.number()),
    alias: z.string().optional(),
  })
  .refine((data) => data.fn === "count" || data.column.trim().length > 0, {
    message: "Column is required for this metric function",
    path: ["column"],
  });

export const FilterSchema = z.object({
  field: z.string().min(1, "Filter field is required"),
  op: z.enum(["eq", "ne", "gt", "gte", "lt", "lte"]),
  value: z.string().min(1, "Filter value is required"),
});

export const TimeRangeSchema = z.object({
  column: z.string(),
  from: z.string(),
  to: z.string(),
  intervalUnit: z.string().optional(),
  intervalValue: z.string().optional(),
  fillGaps: z.boolean(),
});

export const OrderBySchema = z.object({
  field: z.string().min(1, "Order by field is required"),
  dir: z.enum(["asc", "desc"]),
});

export const QueryStructureSchema = z.object({
  table: z.string().min(1, "Table is required"),
  metrics: z.array(MetricSchema).min(1, "At least one metric is required"),
  dimensions: z.array(z.string().min(1, "Metric is required")),
  filters: z.array(FilterSchema),
  timeRange: TimeRangeSchema.optional(),
  orderBy: z.array(OrderBySchema),
  limit: z.number().int().positive().optional(),
});

export type QueryStructure = z.infer<typeof QueryStructureSchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type TimeRange = z.infer<typeof TimeRangeSchema>;

export const SqlToJsonResponseSchema = z.object({
  success: z.boolean(),
  jsonStructure: QueryStructureSchema.nullable(),
  error: z.string().nullable(),
});

export const JsonToSqlResponseSchema = z.object({
  success: z.boolean(),
  sql: z.string().nullable(),
  error: z.string().nullable(),
});
