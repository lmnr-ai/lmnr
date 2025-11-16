import { Operator, OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import {
  buildSelectQuery,
  ColumnFilterConfig,
  createCustomFilter,
  createNumberFilter,
  createStringFilter,
  QueryParams,
  QueryResult,
  SelectQueryOptions,
} from "@/lib/actions/common/query-builder";
import { clickhouseClient } from "@/lib/clickhouse/client.ts";
import { searchTypeToQueryFilter } from "@/lib/clickhouse/spans.ts";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { addTimeRangeToQuery, TimeRange } from "@/lib/clickhouse/utils";
import { FilterDef } from "@/lib/db/modifiers";

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
    [
      "tags",
      createCustomFilter(
        (filter, paramKey) => {
          if (filter.operator === Operator.Eq) {
            return `has(tags, {${paramKey}:String})`;
          } else {
            return `NOT has(tags, {${paramKey}:String})`;
          }
        },
        (filter, paramKey) => ({ [paramKey]: filter.value })
      ),
    ],
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
          const [key, val] = filter.value.split("=", 2);
          if (key && val) {
            return `simpleJSONExtractRaw(metadata, {${paramKey}_key:String}) = {${paramKey}_val:String}`;
          }
          return "";
        },
        (filter, paramKey) => {
          const [key, val] = filter.value.split("=", 2);
          if (key && val) {
            return {
              [`${paramKey}_key`]: key,
              [`${paramKey}_val`]: `"${val}"`,
            };
          }
          return {};
        }
      ),
    ],
    ["top_span_type", createStringFilter],
    ["top_span_name", createStringFilter],
    [
      "pattern",
      createCustomFilter(
        (filter, paramKey) => {
          if (filter.operator === Operator.Eq) {
            return `has(patterns, {${paramKey}:UUID})`;
          } else {
            return `NOT has(patterns, {${paramKey}:UUID})`;
          }
        },
        (filter, paramKey) => ({ [paramKey]: filter.value })
      ),
    ],
  ]),
};

// Traces table column mapping
const tracesSelectColumns = [
  "id",
  "formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime",
  "formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime",
  "session_id as sessionId",
  "metadata",
  "tags",
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
];

export interface BuildTracesQueryOptions {
  projectId: string;
  traceType: "DEFAULT" | "EVALUATION" | "EVENT" | "PLAYGROUND";
  traceIds: string[];
  filters: FilterDef[];
  limit: number;
  offset: number;
  startTime?: string;
  endTime?: string;
  pastHours?: string;
}

export const buildTracesQueryWithParams = (options: BuildTracesQueryOptions): QueryResult => {
  const { traceType, traceIds, filters, limit, offset, startTime, endTime, pastHours } = options;

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
      columns: tracesSelectColumns,
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
    customConditions,
    orderBy: [
      {
        column: "start_time",
        direction: "DESC",
      },
    ],
    pagination: {
      limit,
      offset,
    },
  };

  return buildSelectQuery(queryOptions);
};

export const searchSpans = async ({
  projectId,
  searchQuery,
  timeRange,
  searchType,
}: {
  projectId: string;
  searchQuery: string;
  timeRange: TimeRange;
  searchType?: SpanSearchType[];
}): Promise<string[]> => {
  const baseQuery = `
      SELECT DISTINCT(trace_id) traceId FROM spans
      WHERE project_id = {projectId: UUID}
  `;

  const queryWithTime = addTimeRangeToQuery(baseQuery, timeRange, "start_time");

  const finalQuery = `${queryWithTime} AND (${searchTypeToQueryFilter(searchType, "query")})`;

  const response = await clickhouseClient.query({
    query: `${finalQuery}
     ORDER BY start_time DESC
     LIMIT 1000`,
    format: "JSONEachRow",
    query_params: {
      projectId,
      query: `%${searchQuery.toLowerCase()}%`,
    },
  });

  const result = (await response.json()) as { traceId: string }[];

  return result.map((i) => i.traceId);
};

export const buildTracesStatsWhereConditions = (options: {
  traceType: string;
  traceIds: string[];
  filters: FilterDef[];
}): { conditions: [string, ...string[]]; params: Record<string, any> } => {
  const conditions: [string] = [`trace_type = {traceType:String}`];
  const params: Record<string, any> = { traceType: options.traceType };

  if (options.traceIds.length > 0) {
    conditions.push(`id IN ({traceIds:Array(UUID)})`);
    params.traceIds = options.traceIds;
  }

  options.filters.forEach((filter, index) => {
    const paramKey = `${filter.column}_${index}`;
    const processor = tracesColumnFilterConfig.processors.get(filter.column);

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
