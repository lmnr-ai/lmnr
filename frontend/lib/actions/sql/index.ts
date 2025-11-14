import { z } from "zod/v4";

import { fetcherJSON } from "@/lib/utils";

import { JsonToSqlResponseSchema, type QueryStructure, QueryStructureSchema, SqlToJsonResponseSchema } from "./types";

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

const SqlToJsonInputSchema = z.object({
  projectId: z.string(),
  sql: z.string().min(1, { error: "SQL query is required." }),
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
