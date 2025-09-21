import { Operator, OperatorLabelMap } from "@/components/ui/datatable-filter/utils";
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

const traceSpansColumnFilterConfig: ColumnFilterConfig = {
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

const traceSpansSelectColumns = [
  "span_id as spanId",
  "trace_id as traceId",
  "start_time as startTime",
  "end_time as endTime",
  "parent_span_id as parentSpanId",
  "name",
  "attributes",
  "span_type as spanType",
  "status",
  "path",
];

export interface BuildTraceSpansQueryOptions {
  projectId: string;
  traceId: string;
  filters: FilterDef[];
  searchSpanIds?: string[];
}

export const buildTraceSpansQueryWithParams = (options: BuildTraceSpansQueryOptions): QueryResult => {
  const { projectId, traceId, filters, searchSpanIds = [] } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "trace_id = {traceId: UUID}",
      params: { traceId },
    },
  ];

  if (searchSpanIds.length > 0) {
    customConditions.push({
      condition: "span_id IN {searchSpanIds: Array(UUID)}",
      params: { searchSpanIds },
    });
  }

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: traceSpansSelectColumns,
      table: `spans_v0(project_id={projectId: UUID})`,
    },
    filters,
    columnFilterConfig: traceSpansColumnFilterConfig,
    customConditions,
    orderBy: {
      column: "start_time",
      direction: "ASC",
    },
  };

  const queryResult = buildSelectQuery(queryOptions);

  return {
    ...queryResult,
    parameters: {
      projectId,
      ...queryResult.parameters,
    },
  };
};
