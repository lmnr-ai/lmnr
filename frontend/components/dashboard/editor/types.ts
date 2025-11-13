"use client";

import { z } from "zod";

import { ChartType } from "@/components/chart-builder/types";

const MetricSchema = z
  .object({
    fn: z.enum(["count", "sum", "avg", "min", "max", "quantile"]),
    column: z.string().min(1),
    args: z.array(z.number()).optional(),
    alias: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.fn === "count") {
        return true;
      }
      return data.column.length > 0 && data.column !== "";
    },
    {
      message: "Column is required for this metric function",
      path: ["column"],
    }
  );

const FilterSchema = z.object({
  field: z.string().min(1, "Filter field is required"),
  op: z.enum(["eq", "ne", "gt", "gte", "lt", "lte"]),
  value: z.union([z.string().min(1, "Filter value is required"), z.number()]),
});

const DimensionSchema = z.string().min(1, "Dimension column is required");

const OrderBySchema = z.object({
  field: z.string().min(1, "Order by field is required"),
  dir: z.enum(["asc", "desc"]),
});

export const VisualQueryBuilderFormSchema = z.object({
  chartType: z.enum(ChartType, {
    error: "Chart type is required",
  }),
  table: z.string().min(1, "Table is required"),
  metrics: z.array(MetricSchema).min(1, "At least one metric is required"),
  dimensions: z.array(DimensionSchema).optional(),
  filters: z.array(FilterSchema).optional(),
  orderBy: z.array(OrderBySchema).optional(),
  limit: z.number().int().positive().optional(),
});

export type VisualQueryBuilderForm = z.infer<typeof VisualQueryBuilderFormSchema>;

export const getDefaultFormValues = (): VisualQueryBuilderForm => ({
  chartType: ChartType.LineChart,
  table: "spans",
  metrics: [{ fn: "count", column: "*", alias: "count" }],
  dimensions: [],
  filters: [],
  orderBy: [],
  limit: undefined,
});
