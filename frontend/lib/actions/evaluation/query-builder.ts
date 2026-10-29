import { z } from "zod/v4";

import { OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Operator } from "@/lib/actions/common/operators";
import { backtickEscape, type QueryParams, type QueryResult } from "@/lib/actions/common/query-builder";

// -- Types --

export interface EvalQueryColumn {
  id: string; // "index", "duration", "score:accuracy"
  sql: string; // "`index`", "duration", "(toUnixTimestamp64Milli(...))"
  comparable?: boolean;
  filterSql?: string; // WHERE clause SQL (defaults to sql). Template for JSON filters.
  dbType?: string; // DB type for casting: "String", "Float64", "Int64", "UUID"
}

export const EvalFilterSchema = z.object({
  column: z.string(),
  operator: z.nativeEnum(Operator),
  value: z.union([z.string(), z.number()]),
});

export type EvalFilter = z.infer<typeof EvalFilterSchema>;

export interface EvalQueryOptions {
  evaluationId: string;
  columns: EvalQueryColumn[];
  traceIds: string[];
  filters: EvalFilter[];
  limit: number;
  offset: number;
  sortBy?: string;
  sortSql?: string;
  sortDirection?: "ASC" | "DESC";
}

export interface EvalTrialsQueryOptions {
  evaluationId: string;
  columns: EvalQueryColumn[];
  traceIds: string[];
  filters: EvalFilter[];
  taskIds: string[];
}

export interface EvalStatsQueryOptions {
  evaluationId: string;
  traceIds: string[];
  filters: EvalFilter[];
  columns?: EvalQueryColumn[];
}

// -- Helpers --

function buildFilterConditions(
  filters: EvalFilter[],
  columns: EvalQueryColumn[],
  paramPrefix: string
): { conditions: string[]; params: QueryParams } {
  const conditions: string[] = [];
  const params: QueryParams = {};

  filters.forEach((filter, index) => {
    const col = columns.find((c) => c.id === filter.column);
    if (!col) return; // unknown column, skip

    const filterSql = col.filterSql ?? col.sql;
    const dbType = col.dbType ?? "String";
    const safeColumn = filter.column.replace(/[^a-zA-Z0-9_]/g, "_");
    const paramKey = `${paramPrefix}_${safeColumn}_${index}`;

    // JSON template filter (e.g. metadata)
    if (filterSql.includes("{KEY:")) {
      const [key, val] = String(filter.value).split("=", 2);
      if (key && val) {
        const condition = filterSql
          .replace(/\{KEY:String\}/g, `{${paramKey}_key:String}`)
          .replace(/\{VAL:String\}/g, `{${paramKey}_val:String}`);
        conditions.push(condition);
        params[`${paramKey}_key`] = key;
        params[`${paramKey}_val`] = val;
      }
      return;
    }

    // Standard filter
    const opSymbol = OperatorLabelMap[filter.operator as Operator];
    const isNumeric = dbType === "Int64" || dbType === "Float64";
    const parsedValue = isNumeric
      ? dbType === "Int64"
        ? parseInt(String(filter.value))
        : parseFloat(String(filter.value))
      : String(filter.value);
    if (isNumeric && isNaN(parsedValue as number)) return;

    conditions.push(`${filterSql} ${opSymbol} {${paramKey}:${dbType}}`);
    params[paramKey] = parsedValue;
  });

  return { conditions, params };
}

// -- Main builders --

interface WhereClause {
  whereStr: string;
  parameters: QueryParams;
}

function buildWhere(
  evaluationId: string,
  traceIds: string[],
  filters: EvalFilter[],
  columns: EvalQueryColumn[]
): WhereClause {
  const parameters: QueryParams = { evaluationId };
  const conditions = ["evaluation_id = {evaluationId:UUID}"];

  if (traceIds.length > 0) {
    conditions.push("trace_id IN ({traceIds:Array(UUID)})");
    parameters.traceIds = traceIds;
  }

  const { conditions: filterConditions, params: filterParams } = buildFilterConditions(filters, columns, "f");
  conditions.push(...filterConditions);
  Object.assign(parameters, filterParams);

  return { whereStr: `WHERE ${conditions.join(" AND ")}`, parameters };
}

// Trials repeat a Task, so sorting by a numeric column sorts Tasks by their mean.
function taskSortExpression(sortBy: string, sortSql: string | undefined, columns: EvalQueryColumn[]): string {
  if (sortBy === "taskId") return "task_id";
  const col = columns.find((c) => c.id === sortBy);
  const expr = sortSql ?? col?.sql ?? "`index`";
  // simpleJSONExtractFloat reads a missing score as 0; skip those Trials like the displayed mean does.
  if (sortBy.startsWith("score:")) {
    const name = sortBy.slice("score:".length).replace(/[\\']/g, "\\$&");
    return `avgIf(${expr}, simpleJSONHas(scores, '${name}'))`;
  }
  return col?.dbType === "Float64" ? `avg(${expr})` : `min(${expr})`;
}

/**
 * One page of Task ids. Filters apply to Trials, so a Task is on the page when any Trial matches.
 * Paging by Task keeps every Trial of a Task on the same page.
 */
export function buildEvalTaskPageQuery(options: EvalQueryOptions): QueryResult {
  const { evaluationId, columns, traceIds, filters, limit, offset, sortBy, sortSql, sortDirection } = options;
  const { whereStr, parameters } = buildWhere(evaluationId, traceIds, filters, columns);

  const orderBy = [
    ...(sortBy ? [`${taskSortExpression(sortBy, sortSql, columns)} ${sortDirection ?? "ASC"}`] : []),
    "min(`index`) ASC",
    "min(created_at) ASC",
    "task_id ASC",
  ];

  const query = `SELECT task_id FROM evaluation_datapoints ${whereStr} GROUP BY task_id ORDER BY ${orderBy.join(", ")} LIMIT {limit:UInt32} OFFSET {offset:UInt32}`;

  return { query, parameters: { ...parameters, limit, offset } };
}

// Inner queries select every column under a positional alias. ClickHouse resolves a SELECT alias
// before a same-named table column, so `substring(data, 1, 200) as data` would feed the truncated
// value to custom columns, filters and sorts that read `data`.
const colAlias = (i: number) => `__c${i}`;

/** Every Trial of `taskIds` matching the filters, in attempt order within a Task. */
export function buildEvalTrialsQuery(options: EvalTrialsQueryOptions): QueryResult {
  const { evaluationId, columns, traceIds, filters, taskIds } = options;

  if (columns.length === 0) {
    throw new Error("columns must not be empty");
  }

  const { whereStr, parameters } = buildWhere(evaluationId, traceIds, filters, columns);

  const innerSelect = [
    ...columns.map((c, i) => `${c.sql} as ${colAlias(i)}`),
    "`index` as __s0",
    "attempt as __s1",
  ].join(", ");
  const inner = `SELECT ${innerSelect} FROM evaluation_datapoints ${whereStr} AND has({taskIds:Array(String)}, task_id)`;

  const outerSelect = columns.map((c, i) => `${colAlias(i)} as ${backtickEscape(c.id)}`).join(", ");
  const query = `SELECT ${outerSelect} FROM (${inner}) ORDER BY __s0 ASC, __s1 ASC`;

  return { query, parameters: { ...parameters, taskIds } };
}

// -- Stats query builder --

export function buildEvalStatsQuery(options: EvalStatsQueryOptions): QueryResult {
  const { evaluationId, traceIds, filters, columns } = options;
  const parameters: QueryParams = {};

  const whereConditions: string[] = [];

  whereConditions.push(`evaluation_id = {evaluationId:UUID}`);
  parameters.evaluationId = evaluationId;

  if (traceIds.length > 0) {
    whereConditions.push(`trace_id IN ({traceIds:Array(UUID)})`);
    parameters.traceIds = traceIds;
  }

  // Resolve filter SQL from columns array
  const { conditions: filterConditions, params: filterParams } = buildFilterConditions(filters, columns ?? [], "sf");
  whereConditions.push(...filterConditions);
  Object.assign(parameters, filterParams);

  const whereStr = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const query = `SELECT task_id, scores, trace_status, top_span_id FROM evaluation_datapoints ${whereStr}`;

  return { query: query.trim(), parameters };
}
