import { isNil } from "lodash";

import { Operator, OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import {
  buildSelectQuery,
  ColumnFilterConfig,
  createCustomFilter,
  createStringFilter,
  QueryParams,
  QueryResult,
  SelectQueryOptions,
} from "@/lib/actions/common/query-builder";
import { FilterDef } from "@/lib/db/modifiers";

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
        (filter, paramKey) => ({ [paramKey]: parseFloat(filter.value) })
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
        (filter, paramKey) => ({ [paramKey]: parseFloat(filter.value) })
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
        (filter, paramKey) => ({ [paramKey]: parseFloat(filter.value) })
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
        (filter, paramKey) => ({ [paramKey]: parseFloat(filter.value) })
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
        (filter, paramKey) => ({ [paramKey]: parseFloat(filter.value) })
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
        (filter, paramKey) => ({ [paramKey]: parseFloat(filter.value) })
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
        (filter, paramKey) => ({ [paramKey]: parseFloat(filter.value) })
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
        (filter, paramKey) => ({ [paramKey]: parseFloat(filter.value) })
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

  const whereFilters: FilterDef[] = [];
  const havingFilters: FilterDef[] = [];

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
        column: "MIN(start_time)",
        direction: "DESC",
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

export const buildSessionsCountQueryWithParams = (
  options: Omit<BuildSessionsQueryOptions, "limit" | "offset">
): QueryResult => {
  const { traceIds = [], filters, startTime, endTime, pastHours } = options;

  const whereFilters: FilterDef[] = [];
  const havingFilters: FilterDef[] = [];

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

  if (havingFilters.length > 0) {
    const subqueryOptions: SelectQueryOptions = {
      select: {
        columns: ["session_id"],
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
    };

    const subquery = buildSelectQuery(subqueryOptions);

    return {
      query: `SELECT COUNT(*) as count FROM (${subquery.query}) as sessions_with_filters`,
      parameters: subquery.parameters,
    };
  }

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
    filters: whereFilters,
    columnFilterConfig: sessionsWhereColumnFilterConfig,
    customConditions,
  };

  return buildSelectQuery(queryOptions);
};
