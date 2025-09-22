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

const spansColumnFilterConfig: ColumnFilterConfig = {
  processors: new Map([
    ["span_id", createStringFilter],
    ["trace_id", createStringFilter],
    ["name", createStringFilter],
    ["span_type", createStringFilter],
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
    ["path", createStringFilter],
    ["model", createStringFilter],
    ["input_tokens", createNumberFilter("Float64")],
    ["output_tokens", createNumberFilter("Float64")],
    ["total_tokens", createNumberFilter("Float64")],
    ["input_cost", createNumberFilter("Float64")],
    ["output_cost", createNumberFilter("Float64")],
    ["total_cost", createNumberFilter("Float64")],
    ["duration", createNumberFilter("Float64")],
  ]),
};

const spansSelectColumns = [
  "span_id as spanId",
  "trace_id as traceId",
  "parent_span_id as parentSpanId",
  "name",
  "span_type as spanType",
  "start_time as startTime",
  "end_time as endTime",
  "input_cost as inputCost",
  "output_cost as outputCost",
  "total_cost as totalCost",
  "input_tokens as inputTokens",
  "output_tokens as outputTokens",
  "total_tokens as totalTokens",
  "status",
  "tags",
  "substring(input, 1, 200) as inputPreview",
  "substring(output, 1, 200) as outputPreview",
  "path",
  "model",
  "duration",
];

export interface BuildSpansQueryOptions {
  columns?: string[];
  projectId: string;
  spanIds?: string[];
  filters: FilterDef[];
  limit?: number;
  offset?: number;
  startTime?: string;
  endTime?: string;
  pastHours?: string;
}

export const buildSpansQueryWithParams = (options: BuildSpansQueryOptions): QueryResult => {
  const { spanIds = [], filters, limit, offset, startTime, endTime, pastHours, columns } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> =
    spanIds?.length > 0
      ? [
          {
            condition: `span_id IN ({spanIds:Array(UUID)})`,
            params: { spanIds },
          },
        ]
      : [];

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: columns || spansSelectColumns,
      table: "spans",
    },
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "start_time",
    },
    filters,
    columnFilterConfig: spansColumnFilterConfig,
    customConditions,
    orderBy: {
      column: "start_time",
      direction: "DESC",
    },
    ...(!!limit &&
      !!offset && {
        pagination: {
          limit,
          offset,
        },
      }),
  };

  return buildSelectQuery(queryOptions);
};

export const buildSpansCountQueryWithParams = (
  options: Omit<BuildSpansQueryOptions, "limit" | "offset">
): QueryResult => {
  const { spanIds = [], filters, startTime, endTime, pastHours } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> =
    spanIds?.length > 0
      ? [
          {
            condition: `span_id IN ({spanIds:Array(UUID)})`,
            params: { spanIds },
          },
        ]
      : [];

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: ["COUNT(*) as count"],
      table: "spans",
    },
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "start_time",
    },
    filters,
    columnFilterConfig: spansColumnFilterConfig,
    customConditions,
  };

  return buildSelectQuery(queryOptions);
};
