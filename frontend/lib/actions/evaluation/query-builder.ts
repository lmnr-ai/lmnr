import { OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { type Operator } from "@/lib/actions/common/operators";
import { type QueryParams, type QueryResult } from "@/lib/actions/common/query-builder";
import { z } from "zod/v4";

// -- Types --

export interface EvalQueryColumn {
  id: string; // "index", "duration", "score:accuracy"
  sql: string; // "dp.index", "(toUnixTimestamp64Milli(...))"
  comparable?: boolean;
  filterSql?: string; // WHERE clause SQL (defaults to sql). Template for JSON filters.
  dbType?: string; // DB type for casting: "String", "Float64", "Int64", "UUID"
}

export const EvalFilterSchema = z.object({
  column: z.string(),
  operator: z.string(),
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

function backtickEscape(id: string): string {
  return `\`${id.replace(/`/g, "``")}\``;
}

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
    const paramKey = `${paramPrefix}_${filter.column}_${index}`;

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
      ? (dbType === "Int64" ? parseInt(String(filter.value)) : parseFloat(String(filter.value)))
      : String(filter.value);
    if (isNumeric && isNaN(parsedValue as number)) return;

    conditions.push(`${filterSql} ${opSymbol} {${paramKey}:${dbType}}`);
    params[paramKey] = parsedValue;
  });

  return { conditions, params };
}

// -- Main builder --

export function buildEvalQuery(options: EvalQueryOptions): QueryResult {
  const { evaluationId, columns, traceIds, filters, limit, offset, sortBy, sortSql, sortDirection, targetId } =
    options;

  if (targetId) {
    return buildComparisonQuery(options);
  }

  return buildSingleEvalQuery({
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
}

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
}

function buildSingleEvalQuery(options: SingleEvalQueryOptions): QueryResult {
  const { evaluationId, columns, traceIds, filters, limit, offset, sortBy, sortSql, sortDirection, evalIdParam } =
    options;

  const parameters: QueryParams = {};

  // SELECT
  const selectClauses = columns.map((c) => `${c.sql} as ${backtickEscape(c.id)}`);
  const selectStr = selectClauses.join(", ");

  // FROM + JOIN
  const fromStr = "evaluation_datapoints dp JOIN traces t ON t.id = dp.trace_id";

  // WHERE
  const whereConditions: string[] = [];

  // Always filter by evaluation_id
  whereConditions.push(`dp.evaluation_id = {${evalIdParam}:UUID}`);
  parameters[evalIdParam] = evaluationId;

  // Pre-filter by trace IDs (from search)
  if (traceIds.length > 0) {
    whereConditions.push(`dp.trace_id IN ({traceIds:Array(UUID)})`);
    parameters.traceIds = traceIds;
  }

  // Apply column filters
  const { conditions: filterConditions, params: filterParams } = buildFilterConditions(filters, columns, "f");
  whereConditions.push(...filterConditions);
  Object.assign(parameters, filterParams);

  const whereStr = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // ORDER BY
  let orderByStr: string;
  if (sortBy) {
    const sortColumn = resolveSortExpression(sortBy, sortSql, columns);
    const direction = sortDirection ?? "ASC";
    orderByStr = `ORDER BY ${sortColumn} ${direction}`;
  } else {
    orderByStr = "ORDER BY dp.index ASC, dp.created_at ASC";
  }

  // PAGINATION
  let paginationStr = "";
  if (limit != null && offset != null) {
    paginationStr = `LIMIT {limit:UInt32} OFFSET {offset:UInt32}`;
    parameters.limit = limit;
    parameters.offset = offset;
  }

  const query = `SELECT ${selectStr} FROM ${fromStr} ${whereStr} ${orderByStr} ${paginationStr}`
    .trim()
    .replace(/\s+/g, " ");

  return { query, parameters };
}

function resolveSortExpression(sortBy: string, sortSql?: string, columns?: EvalQueryColumn[]): string {
  if (sortSql) return sortSql;
  const col = columns?.find((c) => c.id === sortBy);
  return col?.sql ?? "dp.index";
}

// -- Comparison builder --

function buildComparisonQuery(options: EvalQueryOptions): QueryResult {
  const { evaluationId, columns, traceIds, filters, limit, offset, sortBy, sortSql, sortDirection, targetId } =
    options;

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
  });

  // Build comparison subquery (no pagination - need all rows for LEFT JOIN matching)
  const comparedResult = buildSingleEvalQuery({
    evaluationId: targetId!,
    columns,
    traceIds,
    filters,
    evalIdParam: "targetId",
  });

  // Merge parameters (they share filter params since both use the same prefix)
  const parameters: QueryParams = {
    ...primaryResult.parameters,
    ...comparedResult.parameters,
  };

  // Determine which columns get compared aliases — uses comparable flag from FE column config
  const comparableColumns = columns.filter((c) => c.comparable);

  // Build outer SELECT
  const primarySelect = columns.map((c) => `p.${backtickEscape(c.id)}`);
  const comparedSelect = comparableColumns.map(
    (c) => `c.${backtickEscape(c.id)} as ${backtickEscape(`compared:${c.id}`)}`
  );

  const outerSelect = [...primarySelect, ...comparedSelect].join(", ");

  const query = `SELECT ${outerSelect} FROM (${primaryResult.query}) AS p LEFT JOIN (${comparedResult.query}) AS c ON p.\`index\` = c.\`index\``;

  return { query, parameters };
}

// -- Stats query builder --

export function buildEvalStatsQuery(options: EvalStatsQueryOptions): QueryResult {
  const { evaluationId, traceIds, filters, columns } = options;
  const parameters: QueryParams = {};

  const whereConditions: string[] = [];

  whereConditions.push(`dp.evaluation_id = {evaluationId:UUID}`);
  parameters.evaluationId = evaluationId;

  if (traceIds.length > 0) {
    whereConditions.push(`dp.trace_id IN ({traceIds:Array(UUID)})`);
    parameters.traceIds = traceIds;
  }

  // Resolve filter SQL from columns array
  const { conditions: filterConditions, params: filterParams } = buildFilterConditions(filters, columns ?? [], "sf");
  whereConditions.push(...filterConditions);
  Object.assign(parameters, filterParams);

  const whereStr = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const query = `SELECT dp.scores FROM evaluation_datapoints dp JOIN traces t ON t.id = dp.trace_id ${whereStr}`;

  return { query: query.trim(), parameters };
}
