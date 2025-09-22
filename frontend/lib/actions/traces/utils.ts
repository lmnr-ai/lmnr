import { Operator, OperatorLabelMap } from "@/components/ui/datatable-filter/utils.ts";
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

const tracesColumnFilterConfig: ColumnFilterConfig = {
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
    orderBy: {
      column: "start_time",
      direction: "DESC",
    },
    pagination: {
      limit,
      offset,
    },
  };

  return buildSelectQuery(queryOptions);
};

export const buildTracesCountQueryWithParams = (
  options: Omit<BuildTracesQueryOptions, "limit" | "offset">
): QueryResult => {
  const { traceType, traceIds, filters, startTime, endTime, pastHours } = options;
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
      columns: ["COUNT(*) as count"],
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
  };

  return buildSelectQuery(queryOptions);
};
