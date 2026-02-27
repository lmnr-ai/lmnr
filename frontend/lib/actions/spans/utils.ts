import { isNil } from "lodash";

import { type TraceViewSpan } from "@/components/traces/trace-view/store";
import { OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import { type Filter } from "@/lib/actions/common/filters";
import {
  buildSelectQuery,
  type ColumnFilterConfig,
  createArrayColumnFilter,
  createCustomFilter,
  createNumberFilter,
  createStringFilter,
  type QueryParams,
  type QueryResult,
  type SelectQueryOptions,
} from "@/lib/actions/common/query-builder";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { tryParseJson } from "@/lib/utils.ts";

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
    ["tags", createArrayColumnFilter("String")],
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
  "formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime",
  "formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime",
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
  filters: Filter[];
  limit?: number;
  offset?: number;
  startTime?: string;
  endTime?: string;
  pastHours?: string;
  customConditions?: Array<{
    condition: string;
    params: QueryParams;
  }>;
  orderBy?: Array<{
    column: string;
    direction: "ASC" | "DESC";
  }>;
}

export const buildSpansQueryWithParams = (options: BuildSpansQueryOptions): QueryResult => {
  const {
    spanIds = [],
    filters,
    limit,
    offset,
    startTime,
    endTime,
    pastHours,
    columns,
    customConditions: additionalConditions = [],
    orderBy,
  } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    ...additionalConditions,
    ...(spanIds?.length > 0
      ? [
          {
            condition: `span_id IN ({spanIds:Array(UUID)})`,
            params: { spanIds },
          },
        ]
      : []),
  ];

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
    orderBy: orderBy || [
      {
        column: "start_time",
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

export const buildSpansCountQueryWithParams = (
  options: Omit<BuildSpansQueryOptions, "limit" | "offset">
): QueryResult => {
  const { spanIds = [], filters, startTime, endTime, pastHours, customConditions: additionalConditions = [] } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    ...additionalConditions,
    ...(spanIds?.length > 0
      ? [
          {
            condition: `span_id IN ({spanIds:Array(UUID)})`,
            params: { spanIds },
          },
        ]
      : []),
  ];

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

export const createParentRewiring = (
  matchingSpanIds: string[],
  treeStructure: { spanId: string; parentSpanId: string | undefined }[]
): Map<string, string | undefined> => {
  if (matchingSpanIds.length === 0) {
    return new Map();
  }

  const spanMap = new Map(treeStructure.map((span) => [span.spanId, span.parentSpanId]));
  const matchingSet = new Set(matchingSpanIds);
  const parentRewiring = new Map<string, string | undefined>();

  for (const spanId of matchingSpanIds) {
    let currentSpanId = spanId;
    let newParent: string | undefined = undefined;

    while (currentSpanId) {
      const parentId = spanMap.get(currentSpanId);
      if (!parentId || parentId === "00000000-0000-0000-0000-000000000000") {
        // Reached root, no parent
        break;
      }

      if (matchingSet.has(parentId)) {
        newParent = parentId;
        break;
      }

      currentSpanId = parentId;
    }

    parentRewiring.set(spanId, newParent);
  }

  return parentRewiring;
};

const applyParentRewiring = (
  span: { spanId: string; parentSpanId?: string },
  parentRewiring: Map<string, string | undefined>
): string | undefined => {
  if (parentRewiring.has(span.spanId)) {
    const effectiveParentId = parentRewiring.get(span.spanId) || undefined;
    return effectiveParentId === "00000000-0000-0000-0000-000000000000" ? undefined : effectiveParentId;
  }
  return span.parentSpanId === "00000000-0000-0000-0000-000000000000" ? undefined : span.parentSpanId;
};
export const transformSpanWithEvents = (
  span: Omit<TraceViewSpan, "attributes" | "events"> & {
    attributes: string;
    events?: { timestamp: number; name: string; attributes: string }[];
  },
  parentRewiring: Map<string, string | undefined>
): TraceViewSpan => {
  const parsedAttributes = tryParseJson(span.attributes) || {};
  const cacheReadInputTokens = parsedAttributes["gen_ai.usage.cache_read_input_tokens"] || 0;

  return {
    ...span,
    attributes: parsedAttributes,
    cacheReadInputTokens,
    parentSpanId: applyParentRewiring(span, parentRewiring),
    name: span.name,
    events: (span.events || []).map((event) => ({
      timestamp: event.timestamp,
      name: event.name,
      attributes: tryParseJson(event.attributes) || {},
    })),
    collapsed: false,
  };
};

interface AggregatedMetrics {
  totalCost: number;
  totalTokens: number;
  cacheReadInputTokens: number;
  hasLLMDescendants: boolean;
}

export const aggregateSpanMetrics = (spans: TraceViewSpan[]): TraceViewSpan[] => {
  const spanMap = new Map<string, TraceViewSpan>();
  const childrenMap = new Map<string, string[]>();
  const metricsCache = new Map<string, AggregatedMetrics | null>();

  for (const span of spans) {
    spanMap.set(span.spanId, span);
    if (span.parentSpanId) {
      const siblings = childrenMap.get(span.parentSpanId) || [];
      siblings.push(span.spanId);
      childrenMap.set(span.parentSpanId, siblings);
    }
  }

  const calculateMetrics = (spanId: string): AggregatedMetrics | null => {
    if (metricsCache.has(spanId)) {
      return metricsCache.get(spanId)!;
    }

    const span = spanMap.get(spanId)!;
    const children = childrenMap.get(spanId) || [];

    if (children.length === 0) {
      if (span.spanType === "LLM") {
        const cost = span.totalCost || (span.inputCost ?? 0) + (span.outputCost ?? 0);
        const tokens = span.totalTokens || (span.inputTokens ?? 0) + (span.outputTokens ?? 0);
        const cacheTokens = span.cacheReadInputTokens ?? 0;

        const metrics = {
          totalCost: cost,
          totalTokens: tokens,
          cacheReadInputTokens: cacheTokens,
          hasLLMDescendants: true,
        };
        metricsCache.set(spanId, metrics);
        return metrics;
      }
      metricsCache.set(spanId, null);
      return null;
    }

    let totalCost = 0;
    let totalTokens = 0;
    let cacheReadInputTokens = 0;
    let hasLLMDescendants = false;

    for (const childId of children) {
      const childMetrics = calculateMetrics(childId);
      if (childMetrics) {
        totalCost += childMetrics.totalCost;
        totalTokens += childMetrics.totalTokens;
        cacheReadInputTokens += childMetrics.cacheReadInputTokens;
        hasLLMDescendants = true;
      }
    }

    if (hasLLMDescendants) {
      const metrics = {
        totalCost,
        totalTokens,
        cacheReadInputTokens,
        hasLLMDescendants: true,
      };
      metricsCache.set(spanId, metrics);
      return metrics;
    }

    metricsCache.set(spanId, null);
    return null;
  };

  return spans.map((span) => {
    const metrics = calculateMetrics(span.spanId);
    return metrics ? { ...span, aggregatedMetrics: metrics } : span;
  });
};

export const searchTypeToQueryFilter = (searchType?: SpanSearchType[], queryParamName: string = "query"): string => {
  const uniqueSearchTypes = Array.from(new Set(searchType));
  const searchBoth = `input_lower LIKE {${queryParamName}: String} OR output_lower LIKE {${queryParamName}: String}`;
  if (uniqueSearchTypes.length === 0) {
    return searchBoth;
  }
  if (uniqueSearchTypes.length === 1) {
    const searchType = uniqueSearchTypes[0];
    switch (searchType) {
      case SpanSearchType.Input:
        return `input_lower LIKE {${queryParamName}: String}`;
      case SpanSearchType.Output:
        return `output_lower LIKE {${queryParamName}: String}`;
      default:
        return searchBoth;
    }
  }
  return searchBoth;
};
