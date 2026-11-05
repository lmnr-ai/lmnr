import { z } from "zod/v4";

import { callAppServer } from "@/lib/api/backend";

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
 * Mirrors app-server's `SqlQuerySource`. Every source but `internal` (SQL the
 * platform builds itself) is logged as `sql.query` in the audit log.
 */
export type SqlQuerySource = "internal" | "editor" | "export";

/**
 * The actor and source are separate arguments, not part of the input schema,
 * so route handlers that spread a request body cannot let a client pick who
 * they are or opt out of auditing.
 */
export const executeQuery = async <T extends object>(
  input: z.infer<typeof ExecuteQuerySchema>,
  options: { source: SqlQuerySource; actor?: SqlActor }
) => {
  const { parameters, query, projectId } = ExecuteQuerySchema.parse(input);
  const actor = await resolveSqlActor(options.actor);

  const res = (await callAppServer(`/projects/${projectId}/sql/query`, {
    method: "POST",
    body: { query, parameters, actor, source: options.source },
  })) as T[];

  return res;
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
