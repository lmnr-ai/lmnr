import { isNil } from "lodash";

import { Operator } from "@/components/ui/datatable-filter/utils.ts";
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
import { FilterDef } from "@/lib/db/modifiers";

const sessionsColumnFilterConfig: ColumnFilterConfig = {
  processors: new Map([
    ["id", createStringFilter],
    ["user_id", createStringFilter],
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
    ["trace_count", createNumberFilter("Float64")],
    ["input_tokens", createNumberFilter("Float64")],
    ["output_tokens", createNumberFilter("Float64")],
    ["total_tokens", createNumberFilter("Float64")],
    ["input_cost", createNumberFilter("Float64")],
    ["output_cost", createNumberFilter("Float64")],
    ["total_cost", createNumberFilter("Float64")],
    ["duration", createNumberFilter("Float64")],
  ]),
};

const sessionsSelectColumns = [
  "session_id as id",
  "COUNT(*) as traceCount",
  "SUM(input_tokens) as inputTokens",
  "SUM(output_tokens) as outputTokens",
  "SUM(total_tokens) as totalTokens",
  "formatDateTime(MIN(start_time), '%Y-%m-%dT%H:%i:%S.%fZ') as startTime",
  "formatDateTime(MAX(end_time), '%Y-%m-%dT%H:%i:%S.%fZ') as endTime",
  "SUM(duration) as duration",
  "SUM(input_cost) as inputCost",
  "SUM(output_cost) as outputCost",
  "SUM(total_cost) as totalCost",
  "any(user_id) as userId",
];

export interface BuildSessionsQueryOptions {
  columns?: string[];
  traceIds?: string[];
  filters: FilterDef[];
  limit?: number;
  offset?: number;
  startTime?: string;
  endTime?: string;
  pastHours?: string;
}

export const buildSessionsQueryWithParams = (options: BuildSessionsQueryOptions): QueryResult => {
  const { traceIds = [], filters, limit, offset, startTime, endTime, pastHours, columns } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [];

  if (traceIds?.length > 0) {
    customConditions.push({
      condition: `trace_id IN ({traceIds:Array(UUID)})`,
      params: { traceIds },
    });
  }

  customConditions.push({
    condition: `session_id != '<null>' AND session_id != ''`,
    params: {},
  });

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: columns || sessionsSelectColumns,
      table: "traces",
    },
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "start_time",
    },
    filters,
    columnFilterConfig: sessionsColumnFilterConfig,
    customConditions,
    groupBy: ["id"],
    orderBy: {
      column: "MIN(start_time)",
      direction: "DESC",
    },
    ...(!isNil(limit) &&
      !isNil(offset) && {
      pagination: {
        limit,
        offset,
      },
    }),
  };

  return buildSelectQuery(queryOptions);
};

export const buildSessionsCountQueryWithParams = (
  options: Omit<BuildSessionsQueryOptions, "limit" | "offset">
): QueryResult => {
  const { traceIds = [], filters, startTime, endTime, pastHours } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [];

  if (traceIds?.length > 0) {
    customConditions.push({
      condition: `trace_id IN ({traceIds:Array(String)})`,
      params: { traceIds },
    });
  }

  customConditions.push({
    condition: `session_id != '<null>' AND session_id != ''`,
    params: {},
  });

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: ["COUNT(DISTINCT session_id) as count"],
      table: "traces",
    },
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "start_time",
    },
    filters,
    columnFilterConfig: sessionsColumnFilterConfig,
    customConditions,
  };

  return buildSelectQuery(queryOptions);
};
