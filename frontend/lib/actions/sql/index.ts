import { z } from "zod/v4";

import { callAppServer, callAppServerWithHeaders } from "@/lib/api/backend";

import { resolveSqlActor, type SqlActor } from "./actor";
import { JsonToSqlResponseSchema, type QueryStructure, QueryStructureSchema, SqlToJsonResponseSchema } from "./types";

export { SHARED_ACTOR, type SqlActor } from "./actor";
export type { GenerationMode } from "./types";

const ExecuteQuerySchema = z.object({
  projectId: z.guid(),
  query: z.string().min(1, { error: "Query is required." }),
  parameters: z
    .looseObject({
      start_time: z.string().optional(),
      end_time: z.string().optional(),
      interval_unit: z.string().optional(),
    })
    .optional(),
});

/**
 * The actor is a separate argument, not part of the input schema, so route
 * handlers that spread a request body cannot let a client pick who they are.
 */
export const executeQuery = async <T extends object>(
  input: z.infer<typeof ExecuteQuerySchema>,
  options?: { actor?: SqlActor }
) => (await executeQueryWithTables<T>(input, options)).rows;

/** `executeQuery` that also returns the tables the query read, for a route's `sql.query` audit event. */
export const executeQueryWithTables = async <T extends object>(
  input: z.infer<typeof ExecuteQuerySchema>,
  options?: { actor?: SqlActor }
) => {
  const { parameters, query, projectId } = ExecuteQuerySchema.parse(input);
  const actor = await resolveSqlActor(options?.actor);

  const { data, headers } = await callAppServerWithHeaders<T[]>(`/projects/${projectId}/sql/query`, {
    method: "POST",
    body: { query, parameters, actor },
  });

  return { rows: data, tables: headers.get("x-laminar-sql-tables")?.split(",").filter(Boolean) ?? [] };
};

const SqlToJsonInputSchema = z.object({
  projectId: z.guid(),
  sql: z.string().min(1, { error: "SQL query is required." }),
});

export const sqlToJson = async (input: z.infer<typeof SqlToJsonInputSchema>): Promise<QueryStructure> => {
  const { sql, projectId } = SqlToJsonInputSchema.parse(input);

  const res = await callAppServer(`/projects/${projectId}/sql/to-json`, { method: "POST", body: { sql } });

  const parsed = SqlToJsonResponseSchema.parse(res);

  if (!parsed.queryStructure) {
    throw new Error(parsed.error || "Failed to convert SQL to JSON");
  }

  return parsed.queryStructure;
};

const JsonToSqlInputSchema = z.object({
  projectId: z.guid(),
  queryStructure: QueryStructureSchema,
});

export const jsonToSql = async (input: z.infer<typeof JsonToSqlInputSchema>): Promise<string> => {
  const { queryStructure, projectId } = JsonToSqlInputSchema.parse(input);

  const res = await callAppServer(`/projects/${projectId}/sql/from-json`, { method: "POST", body: { queryStructure } });

  const parsed = JsonToSqlResponseSchema.parse(res);

  if (!parsed.success || !parsed.sql) {
    throw new Error(parsed.error || "Failed to convert JSON to SQL");
  }

  return parsed.sql;
};
