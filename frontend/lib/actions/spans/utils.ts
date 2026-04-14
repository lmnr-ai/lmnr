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
import { parseSystemMessageFromInput } from "@/lib/actions/spans/system-messages";
import { executeQuery } from "@/lib/actions/sql";
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
  const reasoningTokens = parsedAttributes["gen_ai.usage.reasoning_tokens"] || 0;

  return {
    ...span,
    attributes: parsedAttributes,
    cacheReadInputTokens,
    reasoningTokens,
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
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  cacheReadInputTokens: number;
  reasoningTokens: number;
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
        const cacheTokens = span.cacheReadInputTokens ?? 0;
        const reasoningTkns = span.reasoningTokens ?? 0;

        const metrics = {
          inputTokens: span.inputTokens ?? 0,
          outputTokens: span.outputTokens ?? 0,
          totalCost: cost,
          cacheReadInputTokens: cacheTokens,
          reasoningTokens: reasoningTkns,
          hasLLMDescendants: true,
        };
        metricsCache.set(spanId, metrics);
        return metrics;
      }
      metricsCache.set(spanId, null);
      return null;
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let totalCost = 0;
    let cacheReadInputTokens = 0;
    let reasoningTokens = 0;
    let hasLLMDescendants = false;

    for (const childId of children) {
      const childMetrics = calculateMetrics(childId);
      if (childMetrics) {
        inputTokens += childMetrics.inputTokens;
        outputTokens += childMetrics.outputTokens;
        totalCost += childMetrics.totalCost;
        cacheReadInputTokens += childMetrics.cacheReadInputTokens;
        reasoningTokens += childMetrics.reasoningTokens;
        hasLLMDescendants = true;
      }
    }

    if (hasLLMDescendants) {
      const metrics = {
        inputTokens,
        outputTokens,
        totalCost,
        cacheReadInputTokens,
        reasoningTokens,
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

const NULL_SPAN_ID = "00000000-0000-0000-0000-000000000000";

const AGENT_GROUPS_QUERY = `
  SELECT
    parent_span_id as parentSpanId,
    path,
    argMin(input, start_time) as firstInput,
    argMin(simpleJSONExtractRaw(attributes, 'lmnr.span.ids_path'), start_time) as idsPathRaw,
    min(start_time) as minStart
  FROM spans
  WHERE trace_id = {traceId: UUID}
    AND span_type IN ('LLM', 'CACHED')
    AND path != ''
  GROUP BY parent_span_id, path
  ORDER BY minStart ASC
`;

/** Find the LCA of two root-to-leaf ID paths (last element of the longest common prefix). */
function findLCAFromPaths(pathA: string[], pathB: string[]): string | undefined {
  let lca: string | undefined;
  for (let i = 0; i < Math.min(pathA.length, pathB.length); i++) {
    if (pathA[i] === pathB[i]) lca = pathA[i];
    else break;
  }
  return lca;
}

export type AgentGroupBoundary = {
  boundaryId: string;
  systemPrompt: string | null;
};

/**
 * Fetch span IDs that serve as sub-agent boundary markers.
 *
 * Groups LLM spans by (parent_span_id, path) so only one input is fetched per group,
 * then uses `lmnr.span.ids_path` to identify where execution diverges from the main
 * agent into sub-agent subtrees.
 */
export async function fetchAgentGroupBoundaries(traceId: string, projectId: string): Promise<AgentGroupBoundary[]> {
  const rows = await executeQuery<{
    parentSpanId: string;
    path: string;
    firstInput: string;
    idsPathRaw: string;
  }>({
    query: AGENT_GROUPS_QUERY,
    parameters: { traceId },
    projectId,
  });

  if (rows.length <= 1) return [];

  type GroupInfo = { parentSpanId: string; path: string; systemPrompt: string | null; idsPath: string[] };
  const groups: GroupInfo[] = [];

  for (const row of rows) {
    const idsPath: string[] | null = tryParseJson(row.idsPathRaw);
    if (!Array.isArray(idsPath) || idsPath.length === 0) continue;
    groups.push({
      parentSpanId: row.parentSpanId,
      path: row.path,
      systemPrompt: parseSystemMessageFromInput(row.firstInput),
      idsPath: idsPath.filter((id) => id !== NULL_SPAN_ID),
    });
  }

  if (groups.length <= 1) return [];

  const mainPrompt = groups[0].systemPrompt;

  const mainSpanIds = new Set<string>();
  const mainGroups: GroupInfo[] = [];
  const nonMainGroups: GroupInfo[] = [];

  for (const group of groups) {
    if (group.systemPrompt === mainPrompt) {
      mainGroups.push(group);
      for (const id of group.idsPath) mainSpanIds.add(id);
    } else {
      nonMainGroups.push(group);
    }
  }

  if (nonMainGroups.length === 0) return [];

  // Collect parent span IDs of all main-agent groups.
  // Any non-main group whose parent is in this set is a peer call, not a sub-agent.
  const mainParentIds = new Set(mainGroups.map((g) => g.parentSpanId));

  const subAgentGroups = nonMainGroups.filter((g) => !mainParentIds.has(g.parentSpanId));
  if (subAgentGroups.length === 0) return [];

  type GroupWithBoundary = GroupInfo & { boundaryId: string };
  const resolved: GroupWithBoundary[] = [];

  for (const group of subAgentGroups) {
    let deepestMainIndex = -1;
    for (let i = 0; i < group.idsPath.length; i++) {
      if (mainSpanIds.has(group.idsPath[i])) deepestMainIndex = i;
    }

    const boundaryId = deepestMainIndex + 1 < group.idsPath.length ? group.idsPath[deepestMainIndex + 1] : undefined;

    if (boundaryId) {
      resolved.push({ ...group, boundaryId });
    }
  }

  if (resolved.length === 0) return [];

  const clusters = new Map<string, GroupWithBoundary[]>();
  for (const group of resolved) {
    const key = `${group.path}\0${group.systemPrompt ?? ""}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(group);
  }

  const seen = new Set<string>();
  const boundaries: AgentGroupBoundary[] = [];

  for (const cluster of clusters.values()) {
    const systemPrompt = cluster[0].systemPrompt;
    let ids: string[];

    if (cluster.length === 1) {
      ids = [cluster[0].boundaryId];
    } else {
      const ancestorPaths = cluster.map((g) => g.idsPath.slice(0, -1));
      let lca = findLCAFromPaths(ancestorPaths[0], ancestorPaths[1]);
      for (let i = 2; i < ancestorPaths.length; i++) {
        if (lca === undefined) break;
        const lcaIndex = ancestorPaths[0].indexOf(lca);
        lca = findLCAFromPaths(ancestorPaths[0].slice(0, lcaIndex + 1), ancestorPaths[i]);
      }

      if (lca && !mainSpanIds.has(lca)) {
        ids = [lca];
      } else {
        ids = cluster.map((g) => g.boundaryId);
      }
    }

    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        boundaries.push({ boundaryId: id, systemPrompt });
      }
    }
  }

  return boundaries;
}
