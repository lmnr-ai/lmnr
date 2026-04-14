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
  totalCost: number;
  totalTokens: number;
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
        const tokens = span.totalTokens || (span.inputTokens ?? 0) + (span.outputTokens ?? 0);
        const cacheTokens = span.cacheReadInputTokens ?? 0;
        const reasoningTkns = span.reasoningTokens ?? 0;

        const metrics = {
          totalCost: cost,
          totalTokens: tokens,
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

    let totalCost = 0;
    let totalTokens = 0;
    let cacheReadInputTokens = 0;
    let reasoningTokens = 0;
    let hasLLMDescendants = false;

    for (const childId of children) {
      const childMetrics = calculateMetrics(childId);
      if (childMetrics) {
        totalCost += childMetrics.totalCost;
        totalTokens += childMetrics.totalTokens;
        cacheReadInputTokens += childMetrics.cacheReadInputTokens;
        reasoningTokens += childMetrics.reasoningTokens;
        hasLLMDescendants = true;
      }
    }

    if (hasLLMDescendants) {
      const metrics = {
        totalCost,
        totalTokens,
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
    path,
    parent_span_id as parentSpanId,
    argMin(input, start_time) as firstInput,
    min(start_time) as minStart
  FROM spans
  WHERE trace_id = {traceId: UUID}
    AND span_type IN ('LLM', 'CACHED')
    AND path != ''
  GROUP BY path, parent_span_id
  ORDER BY minStart ASC
`;

const TREE_STRUCTURE_QUERY = `
  SELECT span_id as spanId, parent_span_id as parentSpanId
  FROM spans
  WHERE trace_id = {traceId: UUID}
`;

/** Walk from `spanId` to root, returning the chain [spanId, parent, grandparent, …]. */
function getAncestorChain(spanId: string, parentMap: Map<string, string | undefined>): string[] {
  const chain: string[] = [];
  let current: string | undefined = spanId;
  while (current && !chain.includes(current)) {
    chain.push(current);
    current = parentMap.get(current);
  }
  return chain;
}

/**
 * Find the Lowest Common Ancestor of a set of span IDs.
 * Returns the deepest span present in every span's ancestor chain.
 */
function findLCA(spanIds: string[], parentMap: Map<string, string | undefined>): string | undefined {
  if (spanIds.length === 0) return undefined;
  if (spanIds.length === 1) return spanIds[0];

  const chains = spanIds.map((id) => getAncestorChain(id, parentMap));
  const ancestorSets = chains.map((c) => new Set(c));

  for (const ancestor of chains[0]) {
    if (ancestorSets.every((set) => set.has(ancestor))) return ancestor;
  }
  return undefined;
}

type AgentGroupInfo = { parentSpanId: string; path: string; systemPrompt: string | null };

export type AgentGroupBoundary = {
  boundaryId: string;
  systemPrompt: string | null;
};

/**
 * Fetch span IDs that serve as transcript group boundaries.
 *
 * Groups LLM spans by (path, parent_span_id), extracts the system prompt
 * from the first LLM call in each group, then clusters by system prompt.
 * The earliest cluster is the main agent — all other clusters are sub-agents
 * whose parent span IDs become group boundaries on the client.
 *
 * When multiple groups share the same (path, systemPrompt) — e.g. an agent
 * that runs several steps under sibling DEFAULT spans — the function merges
 * them into a single boundary at their Lowest Common Ancestor, as long as
 * that LCA is below the main agent's execution level.
 */
export async function fetchAgentGroupBoundaries(traceId: string, projectId: string): Promise<AgentGroupBoundary[]> {
  const rows = await executeQuery<{
    path: string;
    parentSpanId: string;
    firstInput: string;
  }>({
    query: AGENT_GROUPS_QUERY,
    parameters: { traceId },
    projectId,
  });

  if (rows.length <= 1) return [];

  const groups: AgentGroupInfo[] = rows.map((r) => ({
    parentSpanId: r.parentSpanId,
    path: r.path,
    systemPrompt: parseSystemMessageFromInput(r.firstInput),
  }));

  const mainPrompt = groups[0].systemPrompt;
  const mainParentSpanId = groups[0].parentSpanId === NULL_SPAN_ID ? undefined : groups[0].parentSpanId;

  const subAgentGroups = groups.filter((g) => g.systemPrompt !== mainPrompt);
  if (subAgentGroups.length === 0) return [];

  // Cluster sub-agent groups by (path, systemPrompt). Groups in the same
  // cluster are candidates for merging into a single sub-agent boundary
  // (e.g. one agent running multiple steps under sibling DEFAULT spans).
  const clusters = new Map<string, AgentGroupInfo[]>();
  for (const g of subAgentGroups) {
    const key = `${g.path}\0${g.systemPrompt ?? ""}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key)!.push(g);
  }

  const needsMerging = [...clusters.values()].some((c) => c.length > 1);

  let parentMap: Map<string, string | undefined> | null = null;
  let mainAncestors: Set<string> | null = null;
  if (needsMerging) {
    const treeRows = await executeQuery<{ spanId: string; parentSpanId: string }>({
      query: TREE_STRUCTURE_QUERY,
      parameters: { traceId },
      projectId,
    });
    parentMap = new Map(treeRows.map((r) => [r.spanId, r.parentSpanId === NULL_SPAN_ID ? undefined : r.parentSpanId]));
    mainAncestors = mainParentSpanId ? new Set(getAncestorChain(mainParentSpanId, parentMap)) : new Set();
  }

  const seen = new Set<string>();
  const boundaries: AgentGroupBoundary[] = [];

  for (const cluster of clusters.values()) {
    const systemPrompt = cluster[0].systemPrompt;
    let ids: string[];

    if (cluster.length > 1 && parentMap && mainAncestors) {
      const lca = findLCA(
        cluster.map((g) => g.parentSpanId),
        parentMap
      );

      ids = lca && !mainAncestors.has(lca) ? [lca] : cluster.map((g) => g.parentSpanId);
    } else {
      ids = cluster.map((g) => g.parentSpanId);
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
