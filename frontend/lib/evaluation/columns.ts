import { type EvalQueryColumn } from "@/lib/actions/evaluation/query-builder";

type EvalColumnSql = Omit<EvalQueryColumn, "id" | "comparable">;

/**
 * SQL of the built-in evaluation columns, by column id. Shared (public) evaluations resolve
 * column ids against this on the server, so a share-link request never supplies SQL.
 */
export const EVAL_COLUMN_SQL = {
  id: { sql: "id" },
  evaluationId: { sql: "evaluation_id" },
  taskId: { sql: "task_id", dbType: "String" },
  index: { sql: "`index`", dbType: "Int64" },
  data: { sql: "substring(data, 1, 200)" },
  target: { sql: "substring(target, 1, 200)" },
  metadata: {
    sql: "metadata",
    filterSql:
      "(simpleJSONExtractString(metadata, {KEY:String}) = {VAL:String} OR simpleJSONExtractRaw(metadata, {KEY:String}) = {VAL:String})",
  },
  output: { sql: "substring(executor_output, 1, 200)" },
  duration: { sql: "duration", dbType: "Float64" },
  cost: {
    sql: "if(total_cost > 0, greatest(input_cost + output_cost, total_cost), input_cost + output_cost)",
    dbType: "Float64",
  },
  traceId: { sql: "trace_id", dbType: "UUID" },
  startTime: { sql: "formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ')" },
  endTime: { sql: "formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ')" },
  inputCost: { sql: "input_cost" },
  outputCost: { sql: "output_cost" },
  totalCost: { sql: "total_cost" },
  scores: { sql: "scores" },
  createdAt: { sql: "formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ')" },
  traceStatus: { sql: "trace_status" },
  topSpanId: { sql: "top_span_id" },
} satisfies Record<string, EvalColumnSql>;

const SCORE_PREFIX = "score:";

export const scoreColumnSql = (name: string): EvalColumnSql => ({
  sql: `simpleJSONExtractFloat(scores, '${name.replace(/[\\']/g, "\\$&")}')`,
  dbType: "Float64",
});

/** Built-in and score columns for `ids`, with server-side SQL. Other ids (custom SQL columns) are dropped. */
export const resolveEvalColumns = (ids: string[], scoreNames: string[]): EvalQueryColumn[] =>
  ids.flatMap((id): EvalQueryColumn[] => {
    if (Object.hasOwn(EVAL_COLUMN_SQL, id)) {
      return [{ id, ...EVAL_COLUMN_SQL[id as keyof typeof EVAL_COLUMN_SQL] }];
    }
    const scoreName = id.startsWith(SCORE_PREFIX) ? id.slice(SCORE_PREFIX.length) : undefined;
    if (scoreName !== undefined && scoreNames.includes(scoreName)) {
      return [{ id, ...scoreColumnSql(scoreName) }];
    }
    return [];
  });
