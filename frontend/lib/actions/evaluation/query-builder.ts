import { OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { type Filter } from "@/lib/actions/common/filters";
import { type Operator } from "@/lib/actions/common/operators";
import { type QueryParams, type QueryResult } from "@/lib/actions/common/query-builder";

// -- Types --

export interface EvalQueryColumn {
  id: string;   // "index", "duration", "score:accuracy"
  sql: string;  // "a.index", "(toUnixTimestamp64Milli(...))"
}

export interface EvalQueryOptions {
  evaluationId: string;
  columns: EvalQueryColumn[];
  traceIds: string[];
  filters: Filter[];
  limit: number;
  offset: number;
  sortBy?: string;
  sortDirection?: "ASC" | "DESC";
  targetId?: string;
}

export interface EvalStatsQueryOptions {
  evaluationId: string;
  traceIds: string[];
  filters: Filter[];
}

// -- Helpers --

function backtickEscape(id: string): string {
  return `\`${id.replace(/`/g, "``")}\``;
}

function buildFilterConditions(
  filters: Filter[],
  columns: EvalQueryColumn[],
  paramPrefix: string,
): { conditions: string[]; params: QueryParams } {
  const conditions: string[] = [];
  const params: QueryParams = {};
  const columnMap = new Map(columns.map((c) => [c.id, c]));

  filters.forEach((filter, index) => {
    const paramKey = `${paramPrefix}_${filter.column}_${index}`;

    // Special case: metadata key=value filter
    if (filter.column === "metadata") {
      const [key, val] = String(filter.value).split("=", 2);
      if (key && val) {
        conditions.push(
          `(simpleJSONExtractString(a.metadata, {${paramKey}_key:String}) = {${paramKey}_val:String}` +
          ` OR simpleJSONExtractRaw(a.metadata, {${paramKey}_key:String}) = {${paramKey}_val:String})`
        );
        params[`${paramKey}_key`] = key;
        params[`${paramKey}_val`] = val;
      }
      return;
    }

    // Score filters (score:accuracy, etc.)
    if (filter.column.startsWith("score:")) {
      const scoreName = filter.column.split(":")[1];
      const numValue = parseFloat(String(filter.value));
      if (scoreName && !isNaN(numValue)) {
        const opSymbol = OperatorLabelMap[filter.operator as Operator];
        conditions.push(
          `JSONExtractFloat(a.scores, {${paramKey}_name:String}) ${opSymbol} {${paramKey}_value:Float64}`
        );
        params[`${paramKey}_name`] = scoreName;
        params[`${paramKey}_value`] = numValue;
      }
      return;
    }

    // Standard filters — resolve column SQL
    const col = columnMap.get(filter.column);
    if (!col) return;

    const opSymbol = OperatorLabelMap[filter.operator as Operator];

    // Determine ClickHouse type based on column
    if (filter.column === "index") {
      const numValue = parseInt(String(filter.value));
      if (!isNaN(numValue)) {
        conditions.push(`${col.sql} ${opSymbol} {${paramKey}:Int64}`);
        params[paramKey] = numValue;
      }
    } else if (filter.column === "duration" || filter.column === "cost") {
      const numValue = parseFloat(String(filter.value));
      if (!isNaN(numValue)) {
        conditions.push(`${col.sql} ${opSymbol} {${paramKey}:Float64}`);
        params[paramKey] = numValue;
      }
    } else if (filter.column === "traceId") {
      conditions.push(`${col.sql} = {${paramKey}:UUID}`);
      params[paramKey] = String(filter.value);
    } else {
      // Default string filter
      conditions.push(`${col.sql} ${opSymbol} {${paramKey}:String}`);
      params[paramKey] = String(filter.value);
    }
  });

  return { conditions, params };
}

// -- Main builder --

export function buildEvalQuery(options: EvalQueryOptions): QueryResult {
  const {
    evaluationId,
    columns,
    traceIds,
    filters,
    limit,
    offset,
    sortBy,
    sortDirection,
    targetId,
  } = options;

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
    sortDirection,
    evalIdParam: "evaluationId",
  });
}

interface SingleEvalQueryOptions {
  evaluationId: string;
  columns: EvalQueryColumn[];
  traceIds: string[];
  filters: Filter[];
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: "ASC" | "DESC";
  evalIdParam: string; // parameter name for the evaluation ID
}

function buildSingleEvalQuery(options: SingleEvalQueryOptions): QueryResult {
  const {
    evaluationId,
    columns,
    traceIds,
    filters,
    limit,
    offset,
    sortBy,
    sortDirection,
    evalIdParam,
  } = options;

  const parameters: QueryParams = {};

  // SELECT
  const selectClauses = columns.map((c) => `${c.sql} as ${backtickEscape(c.id)}`);
  const selectStr = selectClauses.join(", ");

  // FROM + JOIN
  const fromStr = "evaluation_datapoints a JOIN traces t ON t.id = a.trace_id";

  // WHERE
  const whereConditions: string[] = [];

  // Always filter by evaluation_id
  whereConditions.push(`a.evaluation_id = {${evalIdParam}:UUID}`);
  parameters[evalIdParam] = evaluationId;

  // Pre-filter by trace IDs (from search)
  if (traceIds.length > 0) {
    whereConditions.push(`a.trace_id IN ({traceIds:Array(UUID)})`);
    parameters.traceIds = traceIds;
  }

  // Apply column filters
  const { conditions: filterConditions, params: filterParams } = buildFilterConditions(
    filters,
    columns,
    "f",
  );
  whereConditions.push(...filterConditions);
  Object.assign(parameters, filterParams);

  const whereStr = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // ORDER BY
  let orderByStr: string;
  if (sortBy) {
    const sortColumn = resolveSortExpression(sortBy, columns);
    const direction = sortDirection ?? "ASC";
    orderByStr = `ORDER BY ${sortColumn} ${direction}`;

    // If sorting by a score column, we need the score name param
    if (sortBy.startsWith("score:") || sortBy.startsWith("comparedScore:")) {
      const scoreName = sortBy.split(":")[1];
      if (scoreName) {
        parameters.sortScoreName = scoreName;
      }
    }
  } else {
    orderByStr = "ORDER BY a.index ASC, a.created_at ASC";
  }

  // PAGINATION
  let paginationStr = "";
  if (limit != null && offset != null) {
    paginationStr = `LIMIT {limit:UInt32} OFFSET {offset:UInt32}`;
    parameters.limit = limit;
    parameters.offset = offset;
  }

  const query = `SELECT ${selectStr} FROM ${fromStr} ${whereStr} ${orderByStr} ${paginationStr}`.trim().replace(/\s+/g, " ");

  return { query, parameters };
}

function resolveSortExpression(sortBy: string, columns: EvalQueryColumn[]): string {
  // Score columns (both score: and comparedScore: sort by the same underlying expression)
  if (sortBy.startsWith("score:") || sortBy.startsWith("comparedScore:")) {
    const scoreName = sortBy.split(":")[1];
    if (scoreName) {
      return `JSONExtractFloat(a.scores, {sortScoreName:String})`;
    }
  }

  // Look up in columns
  const col = columns.find((c) => c.id === sortBy);
  if (col) {
    return col.sql;
  }

  // Fallback for known column names
  if (sortBy === "index") return "a.index";
  if (sortBy === "createdAt") return "a.created_at";

  return "a.index";
}

// -- Comparison builder --

function buildComparisonQuery(options: EvalQueryOptions): QueryResult {
  const {
    evaluationId,
    columns,
    traceIds,
    filters,
    limit,
    offset,
    sortBy,
    sortDirection,
    targetId,
  } = options;

  // Build primary subquery (with pagination)
  const primaryResult = buildSingleEvalQuery({
    evaluationId,
    columns,
    traceIds,
    filters,
    limit,
    offset,
    sortBy,
    sortDirection,
    evalIdParam: "evaluationId",
  });

  // Build comparison subquery (no pagination - need all rows for LEFT JOIN matching)
  const comparedResult = buildSingleEvalQuery({
    evaluationId: targetId!,
    columns,
    traceIds, // Same search filter applies to both
    filters,  // Same filters apply to both
    evalIdParam: "targetId",
  });

  // Merge parameters (they share filter params since both use the same prefix)
  const parameters: QueryParams = {
    ...primaryResult.parameters,
    ...comparedResult.parameters,
  };

  // Determine which columns get compared aliases
  const comparableColumns = columns.filter((c) => {
    // All columns that have comparable:true in the meta will be included
    // We check by convention: certain IDs are comparable
    const comparableIds = new Set([
      "duration", "cost", "traceId", "startTime", "endTime",
      "inputCost", "outputCost", "totalCost", "scores",
    ]);
    return comparableIds.has(c.id) || c.id.startsWith("score:");
  });

  // Build outer SELECT
  const primarySelect = columns.map((c) => `p.${backtickEscape(c.id)}`);
  const comparedSelect = comparableColumns.map((c) =>
    `c.${backtickEscape(c.id)} as ${backtickEscape(`compared:${c.id}`)}`
  );

  const outerSelect = [...primarySelect, ...comparedSelect].join(", ");

  const query = `SELECT ${outerSelect} FROM (${primaryResult.query}) AS p LEFT JOIN (${comparedResult.query}) AS c ON p.\`index\` = c.\`index\``;

  return { query, parameters };
}

// -- Stats query builder --

export function buildEvalStatsQuery(options: EvalStatsQueryOptions): QueryResult {
  const { evaluationId, traceIds, filters } = options;
  const parameters: QueryParams = {};

  const whereConditions: string[] = [];

  whereConditions.push(`a.evaluation_id = {evaluationId:UUID}`);
  parameters.evaluationId = evaluationId;

  if (traceIds.length > 0) {
    whereConditions.push(`a.trace_id IN ({traceIds:Array(UUID)})`);
    parameters.traceIds = traceIds;
  }

  // Apply filters - need minimal column set for filter resolution
  const statsColumns: EvalQueryColumn[] = [
    { id: "index", sql: "a.index" },
    { id: "duration", sql: "(toUnixTimestamp64Milli(t.end_time) - toUnixTimestamp64Milli(t.start_time))" },
    { id: "cost", sql: "if(t.total_cost > 0, greatest(t.input_cost + t.output_cost, t.total_cost), t.input_cost + t.output_cost)" },
    { id: "traceId", sql: "a.trace_id" },
    { id: "metadata", sql: "a.metadata" },
  ];

  const { conditions: filterConditions, params: filterParams } = buildFilterConditions(
    filters,
    statsColumns,
    "sf",
  );
  whereConditions.push(...filterConditions);
  Object.assign(parameters, filterParams);

  const whereStr = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const query = `SELECT a.scores FROM evaluation_datapoints a JOIN traces t ON t.id = a.trace_id ${whereStr}`;

  return { query: query.trim(), parameters };
}
