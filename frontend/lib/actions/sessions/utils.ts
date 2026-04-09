import { isNil } from "lodash";

import { OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import { type Filter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";
import {
  buildSelectQuery,
  type ColumnFilterConfig,
  createCustomFilter,
  createStringFilter,
  type QueryParams,
  type QueryResult,
  type SelectQueryOptions,
} from "@/lib/actions/common/query-builder";

const sessionsWhereColumnFilterConfig: ColumnFilterConfig = {
  processors: new Map([
    ["session_id", createStringFilter],
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
  ]),
};

const sessionsHavingColumnFilterConfig: ColumnFilterConfig = {
  processors: new Map([
    [
      "trace_count",
      createCustomFilter(
        (filter, paramKey) => {
          const { operator, value } = filter;
          const opSymbol = OperatorLabelMap[operator];
          return `COUNT(*) ${opSymbol} {${paramKey}:Float64}`;
        },
        (filter, paramKey) => ({ [paramKey]: parseFloat(String(filter.value)) })
      ),
    ],
    [
      "input_tokens",
      createCustomFilter(
        (filter, paramKey) => {
          const { operator, value } = filter;
          const opSymbol = OperatorLabelMap[operator];
          return `SUM(input_tokens) ${opSymbol} {${paramKey}:Float64}`;
        },
        (filter, paramKey) => ({ [paramKey]: parseFloat(String(filter.value)) })
      ),
    ],
    [
      "output_tokens",
      createCustomFilter(
        (filter, paramKey) => {
          const { operator, value } = filter;
          const opSymbol = OperatorLabelMap[operator];
          return `SUM(output_tokens) ${opSymbol} {${paramKey}:Float64}`;
        },
        (filter, paramKey) => ({ [paramKey]: parseFloat(String(filter.value)) })
      ),
    ],
    [
      "total_tokens",
      createCustomFilter(
        (filter, paramKey) => {
          const { operator, value } = filter;
          const opSymbol = OperatorLabelMap[operator];
          return `SUM(total_tokens) ${opSymbol} {${paramKey}:Float64}`;
        },
        (filter, paramKey) => ({ [paramKey]: parseFloat(String(filter.value)) })
      ),
    ],
    [
      "input_cost",
      createCustomFilter(
        (filter, paramKey) => {
          const { operator, value } = filter;
          const opSymbol = OperatorLabelMap[operator];
          return `SUM(input_cost) ${opSymbol} {${paramKey}:Float64}`;
        },
        (filter, paramKey) => ({ [paramKey]: parseFloat(String(filter.value)) })
      ),
    ],
    [
      "output_cost",
      createCustomFilter(
        (filter, paramKey) => {
          const { operator, value } = filter;
          const opSymbol = OperatorLabelMap[operator];
          return `SUM(output_cost) ${opSymbol} {${paramKey}:Float64}`;
        },
        (filter, paramKey) => ({ [paramKey]: parseFloat(String(filter.value)) })
      ),
    ],
    [
      "total_cost",
      createCustomFilter(
        (filter, paramKey) => {
          const { operator, value } = filter;
          const opSymbol = OperatorLabelMap[operator];
          return `SUM(total_cost) ${opSymbol} {${paramKey}:Float64}`;
        },
        (filter, paramKey) => ({ [paramKey]: parseFloat(String(filter.value)) })
      ),
    ],
    [
      "duration",
      createCustomFilter(
        (filter, paramKey) => {
          const { operator, value } = filter;
          const opSymbol = OperatorLabelMap[operator];
          return `SUM(end_time - start_time) ${opSymbol} {${paramKey}:Float64}`;
        },
        (filter, paramKey) => ({ [paramKey]: parseFloat(String(filter.value)) })
      ),
    ],
  ]),
};

const sessionsSelectColumns = [
  "session_id as sessionId",
  "COUNT(*) as traceCount",
  "SUM(input_tokens) as inputTokens",
  "SUM(output_tokens) as outputTokens",
  "SUM(total_tokens) as totalTokens",
  "formatDateTime(MIN(start_time), '%Y-%m-%dT%H:%i:%S.%fZ') as startTime",
  "formatDateTime(MAX(end_time), '%Y-%m-%dT%H:%i:%S.%fZ') as endTime",
  "SUM(end_time - start_time) as duration",
  "SUM(input_cost) as inputCost",
  "SUM(output_cost) as outputCost",
  "SUM(total_cost) as totalCost",
  "any(user_id) as userId",
];

export type SessionSortColumn = "start_time" | "duration" | "total_tokens" | "total_cost" | "trace_count";

export interface BuildSessionsQueryOptions {
  columns?: string[];
  traceIds?: string[];
  filters: Filter[];
  limit?: number;
  offset?: number;
  startTime?: string;
  endTime?: string;
  pastHours?: string;
  sortColumn?: SessionSortColumn;
  sortDirection?: "ASC" | "DESC";
}

const SORT_COLUMN_MAP: Record<SessionSortColumn, string> = {
  start_time: "MIN(start_time)",
  duration: "SUM(end_time - start_time)",
  total_tokens: "SUM(total_tokens)",
  total_cost: "SUM(total_cost)",
  trace_count: "COUNT(*)",
};

export const buildSessionsQueryWithParams = (options: BuildSessionsQueryOptions): QueryResult => {
  const {
    traceIds = [],
    filters,
    limit,
    offset,
    startTime,
    endTime,
    pastHours,
    columns,
    sortColumn,
    sortDirection,
  } = options;

  const whereFilters: Filter[] = [];
  const havingFilters: Filter[] = [];

  const aggregateColumns = new Set([
    "trace_count",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "input_cost",
    "output_cost",
    "total_cost",
    "duration",
  ]);

  filters.forEach((filter) => {
    if (aggregateColumns.has(filter.column)) {
      havingFilters.push(filter);
    } else {
      whereFilters.push(filter);
    }
  });

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [];

  if (traceIds?.length > 0) {
    customConditions.push({
      condition: `id IN ({traceIds:Array(UUID)})`,
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
    filters: whereFilters,
    columnFilterConfig: sessionsWhereColumnFilterConfig,
    havingFilters,
    havingColumnFilterConfig: sessionsHavingColumnFilterConfig,
    customConditions,
    groupBy: ["session_id"],
    orderBy: [
      {
        column: (sortColumn && SORT_COLUMN_MAP[sortColumn]) || "MIN(start_time)",
        direction: sortDirection === "ASC" ? "ASC" : "DESC",
      },
    ],
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
