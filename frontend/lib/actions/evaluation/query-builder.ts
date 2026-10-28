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
  targetId?: string;
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

// -- Main builder --

export function buildEvalQuery(options: EvalQueryOptions): QueryResult {
  const { evaluationId, columns, traceIds, filters, limit, offset, sortBy, sortSql, sortDirection, targetId } = options;

  if (columns.length === 0) {
    throw new Error("columns must not be empty");
  }

  if (targetId) {
    return buildComparisonQuery(options);
  }

  const inner = buildSingleEvalQuery({
    evaluationId,
    columns,
    traceIds,
    filters,
    limit,
    offset,
    sortBy,
    sortSql,
    sortDirection,
    evalIdParam: "evaluationId",
  });

  const outerSelect = columns.map((c, i) => `${colAlias(i)} as ${backtickEscape(c.id)}`).join(", ");
  const query = `SELECT ${outerSelect} FROM (${inner.query}) ORDER BY ${inner.orderBy.join(", ")}`;

  return { query, parameters: inner.parameters };
}

// Inner queries select every column under a positional alias. ClickHouse resolves a SELECT alias
// before a same-named table column, so `substring(data, 1, 200) as data` would feed the truncated
// value to custom columns, filters and sorts that read `data`.
const colAlias = (i: number) => `__c${i}`;
const sortAlias = (i: number) => `__s${i}`;

interface SingleEvalQueryOptions {
  evaluationId: string;
  columns: EvalQueryColumn[];
  traceIds: string[];
  filters: EvalFilter[];
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortSql?: string;
  sortDirection?: "ASC" | "DESC";
  evalIdParam: string; // parameter name for the evaluation ID
  paramPrefix?: string; // prefix for all parameter names to avoid collisions
}

interface InnerEvalQuery extends QueryResult {
  orderBy: string[]; // sort-alias terms, for the outer query to reapply
}

function buildSingleEvalQuery(options: SingleEvalQueryOptions): InnerEvalQuery {
  const { evaluationId, columns, traceIds, filters, limit, offset, sortBy, sortSql, sortDirection, evalIdParam } =
    options;

  const prefix = options.paramPrefix || "";
  const parameters: QueryParams = {};

  const sortExprs = sortBy ? [resolveSortExpression(sortBy, sortSql, columns)] : ["`index`", "created_at"];
  const direction = sortBy ? (sortDirection ?? "ASC") : "ASC";
  const orderBy = sortExprs.map((_, i) => `${sortAlias(i)} ${direction}`);

  // SELECT
  const selectStr = [
    ...columns.map((c, i) => `${c.sql} as ${colAlias(i)}`),
    ...sortExprs.map((e, i) => `${e} as ${sortAlias(i)}`),
  ].join(", ");

  // WHERE
  const whereConditions: string[] = [];

  // Always filter by evaluation_id
  whereConditions.push(`evaluation_id = {${evalIdParam}:UUID}`);
  parameters[evalIdParam] = evaluationId;

  // Pre-filter by trace IDs (from search)
  if (traceIds.length > 0) {
    const traceIdsKey = `${prefix}traceIds`;
    whereConditions.push(`trace_id IN ({${traceIdsKey}:Array(UUID)})`);
    parameters[traceIdsKey] = traceIds;
  }

  // Apply column filters
  const filterPrefix = `${prefix}f`;
  const { conditions: filterConditions, params: filterParams } = buildFilterConditions(filters, columns, filterPrefix);
  whereConditions.push(...filterConditions);
  Object.assign(parameters, filterParams);

  const whereStr = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";
  const orderByStr = `ORDER BY ${orderBy.join(", ")}`;

  // PAGINATION
  let limitString = "";
  if (limit != null) {
    limitString = `LIMIT {limit:UInt32}`;
    parameters.limit = limit;
  }

  let offsetString = "";
  if (offset != null) {
    offsetString = `OFFSET {offset:UInt32}`;
    parameters.offset = offset;
  }

  const query =
    `SELECT ${selectStr} FROM evaluation_datapoints ${whereStr} ${orderByStr} ${limitString} ${offsetString}`
      .trim()
      .replace(/\s+/g, " ");

  return { query, parameters, orderBy };
}

function resolveSortExpression(sortBy: string, sortSql?: string, columns?: EvalQueryColumn[]): string {
  if (sortSql) return sortSql;
  const col = columns?.find((c) => c.id === sortBy);
  return col?.sql ?? "`index`";
}

// -- Comparison builder --

function buildComparisonQuery(options: EvalQueryOptions): QueryResult {
  const { evaluationId, columns, traceIds, filters, limit, offset, sortBy, sortSql, sortDirection, targetId } = options;

  // Build primary subquery (with pagination)
  const primaryResult = buildSingleEvalQuery({
    evaluationId,
    columns,
    traceIds,
    filters,
    limit,
    offset,
    sortBy,
    sortSql,
    sortDirection,
    evalIdParam: "evaluationId",
    paramPrefix: "p_",
  });

  // Comparison subquery must fetch all rows (unpaginated) because the two evaluations
  // may have different indices/sizes — we need the full set for LEFT JOIN matching.
  const comparedResult = buildSingleEvalQuery({
    evaluationId: targetId!,
    columns,
    traceIds,
    filters,
    evalIdParam: "targetId",
    paramPrefix: "c_",
  });

  // Merge parameters (no collisions due to unique prefixes: p_ and c_)
  const parameters: QueryParams = {
    ...primaryResult.parameters,
    ...comparedResult.parameters,
  };

  const indexPos = columns.findIndex((c) => c.id === "index");
  if (indexPos === -1) {
    throw new Error("comparison requires the index column");
  }
  const indexAlias = colAlias(indexPos);

  // Build outer SELECT
  const primarySelect = columns.map((c, i) => `p.${colAlias(i)} as ${backtickEscape(c.id)}`);
  // Compared aliases only for columns the FE config marks comparable
  const comparedSelect = columns
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.comparable)
    .map(({ c, i }) => `c.${colAlias(i)} as ${backtickEscape(`compared:${c.id}`)}`);

  const outerSelect = [...primarySelect, ...comparedSelect].join(", ");
  const orderByStr = `ORDER BY ${primaryResult.orderBy.map((o) => `p.${o}`).join(", ")}`;

  const query = `SELECT ${outerSelect} FROM (${primaryResult.query}) AS p LEFT JOIN (${comparedResult.query}) AS c ON p.${indexAlias} = c.${indexAlias} ${orderByStr}`;

  return { query, parameters };
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

  const query = `SELECT scores FROM evaluation_datapoints ${whereStr}`;

  return { query: query.trim(), parameters };
}
