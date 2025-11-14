import { z } from "zod/v4";

import { fetcherJSON } from "@/lib/utils";

export * from "./export-job";
export * from "./templates";

const ExecuteQuerySchema = z.object({
  projectId: z.string(),
  query: z.string().min(1, { error: "Query is required." }),
  parameters: z
    .looseObject({
      start_time: z.string().optional(),
      end_time: z.string().optional(),
      interval_unit: z.string().optional(),
    })
    .optional(),
});

export const executeQuery = async <T extends object>(input: z.infer<typeof ExecuteQuerySchema>) => {
  const { parameters, query, projectId } = ExecuteQuerySchema.parse(input);

  const res = (await fetcherJSON(`/projects/${projectId}/sql/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, parameters }),
  })) as T[];

  return res;
};

const MetricSchema = z.object({
  fn: z.enum(["count", "sum", "avg", "min", "max", "quantile"]),
  column: z.string(),
  args: z.array(z.number()).optional(),
  alias: z.string().optional(),
});

const FilterSchema = z.object({
  field: z.string(),
  op: z.enum(["eq", "ne", "gt", "gte", "lt", "lte"]),
  value: z.union([z.string().min(1, "Filter value is required"), z.number()]),
});

const TimeRangeSchema = z.object({
  column: z.string(),
  from: z.string(),
  to: z.string(),
  intervalUnit: z.string().optional(),
  intervalValue: z.string().optional(),
  fillGaps: z.boolean(),
});

const OrderBySchema = z.object({
  field: z.string(),
  dir: z.enum(["asc", "desc"]),
});

export const QueryStructureSchema = z.object({
  table: z.string(),
  metrics: z.array(MetricSchema),
  dimensions: z.array(z.string()).optional(),
  filters: z.array(FilterSchema).optional(),
  timeRange: TimeRangeSchema.optional(),
  orderBy: z.array(OrderBySchema).optional(),
  limit: z.number().int().positive().optional(),
});

export type QueryStructure = z.infer<typeof QueryStructureSchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type TimeRange = z.infer<typeof TimeRangeSchema>;

const SqlToJsonInputSchema = z.object({
  projectId: z.string(),
  sql: z.string().min(1, { error: "SQL query is required." }),
});

const SqlToJsonResponseSchema = z.object({
  success: z.boolean(),
  jsonStructure: QueryStructureSchema.nullable(),
  error: z.string().nullable(),
});

export const sqlToJson = async (input: z.infer<typeof SqlToJsonInputSchema>): Promise<QueryStructure> => {
  const { sql, projectId } = SqlToJsonInputSchema.parse(input);

  const res = await fetcherJSON(`/projects/${projectId}/sql/to-json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });

  const parsed = SqlToJsonResponseSchema.parse(res);

  if (!parsed.jsonStructure) {
    throw new Error(parsed.error || "Failed to convert SQL to JSON");
  }

  return parsed.jsonStructure;
};

const JsonToSqlInputSchema = z.object({
  projectId: z.string(),
  queryStructure: QueryStructureSchema,
});

const JsonToSqlResponseSchema = z.object({
  success: z.boolean(),
  sql: z.string().nullable(),
  error: z.string().nullable(),
});

export const jsonToSql = async (input: z.infer<typeof JsonToSqlInputSchema>): Promise<string> => {
  const { queryStructure, projectId } = JsonToSqlInputSchema.parse(input);

  const res = await fetcherJSON(`/projects/${projectId}/sql/from-json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ queryStructure }),
  });

  const parsed = JsonToSqlResponseSchema.parse(res);

  if (!parsed.success || !parsed.sql) {
    throw new Error(parsed.error || "Failed to convert JSON to SQL");
  }

  return parsed.sql;
};
