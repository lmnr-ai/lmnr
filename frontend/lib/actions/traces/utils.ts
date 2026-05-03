import { scaleUtc } from "d3-scale";
import { z } from "zod/v4";

import { OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import { type Filter } from "@/lib/actions/common/filters";
import {
  backtickEscape,
  buildSelectQuery,
  type ColumnFilterConfig,
  type ColumnFilterProcessor,
  createArrayColumnFilter,
  createCustomFilter,
  createNumberFilter,
  createStringFilter,
  type OrderByOptions,
  type QueryParams,
  type QueryResult,
  type SelectQueryOptions,
} from "@/lib/actions/common/query-builder";
import { type TracesStatsDataPoint } from "@/lib/actions/traces/stats.ts";
import { type TimeRange } from "@/lib/clickhouse/utils.ts";

export const tracesColumnFilterConfig: ColumnFilterConfig = {
  processors: new Map([
    ["id", createStringFilter],
    ["session_id", createStringFilter],
    ["user_id", createStringFilter],
    [
      "status",
      createCustomFilter(
        (filter, paramKey) => {
          const { operator, value } = filter;
          if (value === "success") {
            return operator === "eq" ? `status != 'error'` : `status = 'error'`;
          } else if (value === "error") {
            return operator === "eq" ? `status = 'error'` : `status != 'error'`;
          }
          return `status ${OperatorLabelMap[operator]} {${paramKey}:String}`;
        },
        (filter, paramKey) => {
          const { value } = filter;
          return value === "success" || value === "error" ? {} : { [paramKey]: value };
        }
      ),
    ],
    [
      "analysis_status",
      createCustomFilter(
        (filter, paramKey) => {
          const { operator, value } = filter;
          if (value === "info") {
            return operator === "eq" ? `analysis_status = 'info'` : `analysis_status != 'info'`;
          } else if (value === "warning") {
            return operator === "eq" ? `analysis_status = 'warning'` : `analysis_status != 'warning'`;
          } else if (value === "error") {
            return operator === "eq" ? `analysis_status = 'error'` : `analysis_status != 'error'`;
          }
          return `analysis_status ${OperatorLabelMap[operator]} {${paramKey}:String}`;
        },
        (filter, paramKey) => {
          const { value } = filter;
          return value === "success" || value === "error" ? {} : { [paramKey]: value };
        }
      ),
    ],
    ["trace_type", createStringFilter],
    ["tags", createArrayColumnFilter("String")],
    ["trace_tags", createArrayColumnFilter("String")],
    ["total_cost", createNumberFilter("Float64")],
    ["input_cost", createNumberFilter("Float64")],
    ["output_cost", createNumberFilter("Float64")],
    ["total_tokens", createNumberFilter("Int64")],
    ["input_tokens", createNumberFilter("Int64")],
    ["output_tokens", createNumberFilter("Int64")],
    ["duration", createNumberFilter("Float64")],
    [
      "metadata",
      createCustomFilter(
        (filter, paramKey) => {
          const [key, val] = String(filter.value).split("=", 2);
          if (key && val) {
            return (
              `(simpleJSONExtractString(metadata, {${paramKey}_key:String}) = {${paramKey}_val:String}` +
              ` OR simpleJSONExtractRaw(metadata, {${paramKey}_key:String}) = {${paramKey}_val:String})`
            );
          }
          return "";
        },
        (filter, paramKey) => {
          const [key, val] = String(filter.value).split("=", 2);
          if (key && val) {
            return {
              [`${paramKey}_key`]: key,
              [`${paramKey}_val`]: `${val}`,
            };
          }
          return {};
        }
      ),
    ],
    ["top_span_type", createStringFilter],
    ["top_span_name", createStringFilter],
    ["span_names", createArrayColumnFilter("String")],
  ]),
};

// Traces table column mapping
const tracesSelectColumns = [
  "id",
  "formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime",
  "formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime",
  "session_id as sessionId",
  "metadata",
  "tags as spanTags",
  "ifNull(trace_tags, []) as traceTags",
  "input_tokens as inputTokens",
  "output_tokens as outputTokens",
  "top_span_id as topSpanId",
  "top_span_name as topSpanName",
  "top_span_type as topSpanType",
  "total_tokens as totalTokens",
  "input_cost as inputCost",
  "output_cost as outputCost",
  "total_cost as totalCost",
  "trace_type as traceType",
  "status",
  "user_id as userId",
  "root_span_input as rootSpanInput",
  "root_span_output as rootSpanOutput",
];

export const DEFAULT_SEARCH_MAX_HITS = 500;

const ALLOWED_DB_TYPES = new Set(["String", "Float64", "Int64"]);

export interface CustomColumn {
  id: string;
  sql: string;
  filterSql?: string;
  dbType?: string;
}

const CustomColumnsSchema = z.array(
  z.object({
    id: z.string().min(1),
    sql: z.string().min(1),
    filterSql: z.string().optional(),
    dbType: z.enum(["String", "Float64", "Int64"]).optional(),
  })
);

/** Parse and validate a JSON-encoded custom columns string. */
export function parseCustomColumnsJson(json: string | undefined | null): CustomColumn[] | undefined {
  if (!json) return undefined;
  try {
    return CustomColumnsSchema.parse(JSON.parse(json));
  } catch {
    return undefined;
  }
}

export interface BuildTracesQueryOptions {
  projectId: string;
  traceType: "DEFAULT" | "EVALUATION" | "EVENT" | "PLAYGROUND";
  traceIds: string[];
  filters: Filter[];
  limit: number;
  offset: number;
  startTime?: string;
  endTime?: string;
  pastHours?: string;
  sortBy?: string;
  sortSql?: string;
  sortDirection?: "ASC" | "DESC";
  customColumns?: CustomColumn[];
}

/**
 * Build a ColumnFilterConfig that includes both the static traces processors
 * and dynamic processors for any custom SQL columns.
 */
const buildFilterConfigWithCustomColumns = (customColumns?: CustomColumn[]): ColumnFilterConfig => {
  if (!customColumns || customColumns.length === 0) {
    return tracesColumnFilterConfig;
  }

  const processors = new Map(tracesColumnFilterConfig.processors);

  for (const col of customColumns) {
    const filterSql = col.filterSql ?? col.sql;
    const dbType = ALLOWED_DB_TYPES.has(col.dbType ?? "String") ? (col.dbType ?? "String") : "String";
    const isNumeric = dbType === "Int64" || dbType === "Float64";

    const processor: ColumnFilterProcessor = (filter, paramKey) => {
      const opSymbol = OperatorLabelMap[filter.operator];
      const parsedValue = isNumeric
        ? dbType === "Int64"
          ? parseInt(String(filter.value))
          : parseFloat(String(filter.value))
        : String(filter.value);

      if (isNumeric && isNaN(parsedValue as number)) {
        return { condition: null, params: {} };
      }

      return {
        condition: `${filterSql} ${opSymbol} {${paramKey}:${dbType}}`,
        params: { [paramKey]: parsedValue },
      };
    };

    processors.set(col.id, processor);
  }

  return { processors };
};

export const buildTracesQueryWithParams = (options: BuildTracesQueryOptions): QueryResult => {
  const {
    traceType,
    traceIds,
    filters,
    limit,
    offset,
    startTime,
    endTime,
    pastHours,
    sortBy,
    sortSql,
    sortDirection,
    customColumns,
  } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: `trace_type = {traceType:String}`,
      params: { traceType },
    },
  ];

  if (traceIds.length > 0) {
    customConditions.push({
      condition: `id IN ({traceIds:Array(UUID)})`,
      params: { traceIds },
    });
  }

  // Build select columns: static columns + any custom columns
  const selectColumns = [...tracesSelectColumns];
  if (customColumns && customColumns.length > 0) {
    for (const col of customColumns) {
      selectColumns.push(`${col.sql} as ${backtickEscape(col.id)}`);
    }
  }

  // Resolve sort order
  const orderBy: OrderByOptions[] = [];
  if (sortBy && sortSql) {
    orderBy.push({ column: sortSql, direction: sortDirection ?? "DESC" });
  } else {
    orderBy.push({ column: "start_time", direction: sortDirection ?? "DESC" });
  }

  // Build filter config with custom column processors
  const columnFilterConfig = buildFilterConfigWithCustomColumns(customColumns);

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: selectColumns,
      table: "traces",
    },
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "start_time",
    },
    filters,
    columnFilterConfig,
    orderBy,
    customConditions,
    pagination: {
      limit,
      offset,
    },
  };

  return buildSelectQuery(queryOptions);
};

export interface BuildTracesCountQueryOptions {
  projectId: string;
  traceType: "DEFAULT" | "EVALUATION" | "EVENT" | "PLAYGROUND";
  traceIds: string[];
  filters: Filter[];
  startTime?: string;
  endTime?: string;
  pastHours?: string;
  customColumns?: CustomColumn[];
}

export const buildTracesCountQueryWithParams = (options: BuildTracesCountQueryOptions): QueryResult => {
  const { traceType, traceIds, filters, startTime, endTime, pastHours, customColumns } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: `trace_type = {traceType:String}`,
      params: { traceType },
    },
  ];

  if (traceIds.length > 0) {
    customConditions.push({
      condition: `id IN ({traceIds:Array(UUID)})`,
      params: { traceIds },
    });
  }

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: ["count() as count"],
      table: "traces",
    },
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "start_time",
    },
    filters,
    columnFilterConfig: buildFilterConfigWithCustomColumns(customColumns),
    customConditions,
  };

  return buildSelectQuery(queryOptions);
};

export interface BuildTracesIdsQueryOptions {
  traceType: "DEFAULT" | "EVALUATION" | "EVENT" | "PLAYGROUND";
  filters: Filter[];
  limit?: number;
  traceIds?: string[];
  startTime?: string;
  endTime?: string;
  pastHours?: string;
}

export const buildTracesIdsQueryWithParams = (options: BuildTracesIdsQueryOptions): QueryResult => {
  const { traceType, filters, limit, traceIds, startTime, endTime, pastHours } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: `trace_type = {traceType:String}`,
      params: { traceType },
    },
  ];

  if (traceIds && traceIds.length > 0) {
    customConditions.push({
      condition: `id IN ({traceIds:Array(UUID)})`,
      params: { traceIds },
    });
  }

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: ["id"],
      table: "traces",
    },
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "start_time",
    },
    filters,
    columnFilterConfig: tracesColumnFilterConfig,
    orderBy: [
      {
        column: "start_time",
        direction: "DESC",
      },
    ],
    customConditions,
    ...(limit !== undefined && {
      pagination: {
        limit,
        offset: 0,
      },
    }),
  };

  return buildSelectQuery(queryOptions);
};

export const buildTracesStatsWhereConditions = (options: {
  traceType: string;
  traceIds: string[];
  filters: Filter[];
  customColumns?: CustomColumn[];
}): { conditions: [string, ...string[]]; params: Record<string, any> } => {
  const conditions: [string] = [`trace_type = {traceType:String}`];
  const params: Record<string, any> = { traceType: options.traceType };

  if (options.traceIds.length > 0) {
    conditions.push(`id IN ({traceIds:Array(UUID)})`);
    params.traceIds = options.traceIds;
  }

  const columnFilterConfig = buildFilterConfigWithCustomColumns(options.customColumns);

  options.filters.forEach((filter, index) => {
    const safeColumn = filter.column.replace(/[^a-zA-Z0-9_]/g, "_");
    const paramKey = `${safeColumn}_${index}`;
    const processor = columnFilterConfig.processors.get(filter.column);

    if (processor) {
      const result = processor(filter, paramKey);
      if (result.condition) {
        conditions.push(result.condition);
        Object.assign(params, result.params);
      }
    }
  });

  return { conditions, params };
};

export const generateEmptyTimeBuckets = (timeRange: TimeRange): TracesStatsDataPoint[] => {
  let start: Date;
  let end: Date;

  if ("pastHours" in timeRange) {
    end = new Date();
    start = new Date(end.getTime() - timeRange.pastHours * 60 * 60 * 1000);
  } else {
    start = timeRange.start;
    end = timeRange.end;
  }

  const scale = scaleUtc().domain([start, end]);
  const ticks = scale.ticks(24);

  return ticks.map(
    (tick) =>
      ({
        timestamp: tick.toISOString(),
        successCount: 0,
        errorCount: 0,
      }) as TracesStatsDataPoint
  );
};
