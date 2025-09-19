import { and, eq, inArray, not, sql } from "drizzle-orm";

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
import { processFilters, processors } from "@/lib/actions/common/utils";
import { db } from "@/lib/db/drizzle";
import { spans, tagClasses, tags } from "@/lib/db/migrations/schema";
import { FilterDef, filtersToSql } from "@/lib/db/modifiers";
import { createModelFilter } from "@/lib/traces/utils";

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
  projectId: string;
  spanIds?: string[];
  filters: FilterDef[];
  limit: number;
  offset: number;
  startTime?: string;
  endTime?: string;
  pastHours?: string;
}

export const buildSpansQueryWithParams = (options: BuildSpansQueryOptions): QueryResult => {
  const { spanIds = [], filters, limit, offset, startTime, endTime, pastHours } = options;

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
      columns: spansSelectColumns,
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
    pagination: {
      limit,
      offset,
    },
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

const processTraceSpanAttributeFilter = (filter: FilterDef): FilterDef => {
  switch (filter.column) {
    case "path":
      return { ...filter, column: "(attributes ->> 'lmnr.span.path')" };

    case "tokens":
      return { ...filter, column: "(attributes ->> 'llm.usage.total_tokens')::int8" };

    case "cost":
      return { ...filter, column: "(attributes ->> 'gen_ai.usage.cost')::float8" };

    default:
      return filter;
  }
};

export const processTraceSpanFilters = (filters: FilterDef[]) =>
  processFilters<FilterDef, any>(filters, {
    processors: processors<FilterDef, any>([
      {
        column: "status",
        operators: [Operator.Eq, Operator.Ne],
        process: (filter) => {
          if (filter.value === "success") {
            return filter.operator === "eq" ? sql`status IS NULL` : sql`status IS NOT NULL`;
          } else if (filter.value === "error") {
            return filter.operator === "eq" ? sql`status = 'error'` : sql`status != 'error' OR status IS NULL`;
          }
          return sql`1=1`;
        },
      },
      {
        column: "tags",
        operators: [Operator.Eq, Operator.Ne],
        process: (filter) => {
          const name = filter.value;
          const inArrayFilter = inArray(
            spans.spanId,
            db
              .select({ span_id: spans.spanId })
              .from(spans)
              .innerJoin(tags, eq(spans.spanId, tags.spanId))
              .innerJoin(tagClasses, eq(tags.classId, tagClasses.id))
              .where(and(eq(tagClasses.name, name)))
          );
          return filter.operator === "eq" ? inArrayFilter : not(inArrayFilter);
        },
      },
      {
        column: "model",
        operators: [Operator.Eq, Operator.Ne],
        process: (filter) => createModelFilter(filter),
      },
    ]),
    defaultProcessor: (filter) => {
      const processed = processTraceSpanAttributeFilter(filter);
      return (
        filtersToSql([processed], [new RegExp(/^\(attributes\s*->>\s*'[a-zA-Z_\.]+'\)(?:::int8|::float8)?$/)], {
          latency: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))`,
        })[0] || null
      );
    },
  });
