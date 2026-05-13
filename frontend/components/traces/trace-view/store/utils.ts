import { type TraceViewListSpan, type TraceViewSpan, type TranscriptListEntry } from "./base";

export type PathInfo = {
  display: Array<{ spanId: string; name: string; count?: number }>;
  full: Array<{ spanId: string; name: string }>;
} | null;

export interface TreeSpan {
  span: TraceViewSpan;
  depth: number;
  branchMask: boolean[]; // branchMask[d] = true if ancestor at depth d has more children below
  pending: boolean;
  pathInfo: PathInfo;
  // Keep yOffset/parentY for backward compatibility (minimap uses them)
  yOffset: number;
  parentY: number;
}

const getChildSpansMap = <T extends TraceViewSpan>(spans: T[]): { [key: string]: T[] } => {
  const childSpans = {} as { [key: string]: T[] };

  for (const span of spans) {
    if (span.parentSpanId) {
      if (!childSpans[span.parentSpanId]) {
        childSpans[span.parentSpanId] = [];
      }
      childSpans[span.parentSpanId].push(span);
    }
  }

  return childSpans;
};

export const computePathInfoMap = (spans: TraceViewSpan[]): Map<string, PathInfo> => {
  // Build spanMap for parent lookups (needs ALL spans)
  const spanMap = new Map(
    spans.map((span) => [span.spanId, { spanId: span.spanId, name: span.name, parentSpanId: span.parentSpanId }])
  );

  // Memoize parent chains so siblings reuse one walk and the two consumers
  // below (buildSpanNameMap + the pathInfo loop) don't each pay the full cost.
  const parentChainCache = new Map<string, string[]>();
  const getParentIds = (spanId: string): string[] => {
    const cached = parentChainCache.get(spanId);
    if (cached) return cached;
    const span = spanMap.get(spanId);
    const parent = span?.parentSpanId ? spanMap.get(span.parentSpanId) : undefined;
    const result = parent ? [...getParentIds(parent.spanId), parent.spanId] : [];
    parentChainCache.set(spanId, result);
    return result;
  };

  const nonDefaultSpans = spans.filter((span) => span.spanType !== "DEFAULT");
  const sections = groupIntoSections(nonDefaultSpans);
  const spanNameMap = buildSpanNameMap(sections, spanMap, getParentIds);

  const pathInfoMap = new Map<string, PathInfo>();
  for (const span of spans) {
    const parentIds = getParentIds(span.spanId);
    const parentChain = parentIds
      .map((id) => {
        const parent = spanMap.get(id);
        return parent ? { spanId: parent.spanId, name: parent.name } : null;
      })
      .filter((ref): ref is { spanId: string; name: string } => ref !== null);
    pathInfoMap.set(span.spanId, buildPathInfo(parentChain, spanNameMap));
  }

  return pathInfoMap;
};

export const transformSpansToTree = (spans: TraceViewSpan[], pathInfoMap?: Map<string, PathInfo>): TreeSpan[] => {
  const topLevelSpans = spans.filter((span) => !span.parentSpanId);
  const childSpans = getChildSpansMap(spans);

  const spanItems: TreeSpan[] = [];
  const maxY = { current: 0 };

  // Track which ancestor depths have more children to render
  const activeAncestors: boolean[] = [];

  const buildTreeWithCollapse = (
    items: TreeSpan[],
    span: TraceViewSpan,
    depth: number,
    maxY: { current: number },
    parentY: number
  ) => {
    const yOffset = maxY.current + 36;

    // Capture branchMask as snapshot of active ancestors for depths 0 to depth-1
    const branchMask = activeAncestors.slice(0, depth);

    items.push({
      span,
      depth,
      branchMask,
      yOffset,
      parentY,
      pending: span.pending || false,
      pathInfo: pathInfoMap?.get(span.spanId) ?? null,
    });

    maxY.current = maxY.current + 36;

    if (!span.collapsed) {
      const children = childSpans[span.spanId] || [];
      const py = maxY.current;

      children.forEach((child, index) => {
        const isLastChild = index === children.length - 1;

        // Ensure array is long enough
        while (activeAncestors.length <= depth) {
          activeAncestors.push(false);
        }

        // Set whether this depth has more siblings coming
        activeAncestors[depth] = !isLastChild;

        buildTreeWithCollapse(items, child, depth + 1, maxY, py);
      });

      // Clear this depth when done
      if (activeAncestors.length > depth) {
        activeAncestors[depth] = false;
      }
    }
  };

  topLevelSpans.forEach((span) => buildTreeWithCollapse(spanItems, span, 0, maxY, 0));
  return spanItems;
};

const groupIntoSections = (listSpans: TraceViewSpan[]): TraceViewSpan[][] =>
  listSpans.reduce<TraceViewSpan[][]>((sections, span) => {
    const lastSection = sections[sections.length - 1];

    if (span.spanType === "LLM" && lastSection && lastSection.length > 0) {
      sections.push([span]);
    } else {
      if (!lastSection) {
        sections.push([span]);
      } else {
        lastSection.push(span);
      }
    }
    return sections;
  }, []);

/**
 * Calculate occurrence counts [2], [3] for duplicate names within sections.
 * Returns a Map of spanId -> structured data with name and optional count.
 */
const buildSpanNameMap = (
  sections: TraceViewSpan[][],
  spanMap: Map<string, Pick<TraceViewSpan, "spanId" | "name" | "parentSpanId">>,
  getParentIds: (spanId: string) => string[]
): Map<string, { name: string; count?: number }> => {
  const map = new Map<string, { name: string; count?: number }>();

  sections.forEach((section) => {
    const parentChains: string[][] = section.map((listSpan) => [...getParentIds(listSpan.spanId), listSpan.spanId]);

    const commonParentIndex =
      parentChains.length > 0
        ? parentChains[0].reduce(
            (maxIndex, spanId, i) => (parentChains.every((chain) => chain[i] === spanId) ? i : maxIndex),
            0
          )
        : 0;

    const spansInContext = new Set<string>(parentChains.flatMap((chain) => chain.slice(commonParentIndex)));

    const nameCounter = new Map<string, number>();
    for (const id of spansInContext) {
      const span = spanMap.get(id);
      if (!span) continue;
      const count = (nameCounter.get(span.name) ?? 0) + 1;
      nameCounter.set(span.name, count);
      map.set(span.spanId, count > 1 ? { name: span.name, count } : { name: span.name });
    }
  });

  return map;
};

const buildPathInfo = (
  parentChain: Array<{ spanId: string; name: string }>,
  spanNameMap: Map<string, { name: string; count?: number }>
): {
  display: Array<{ spanId: string; name: string; count?: number }>;
  full: Array<{ spanId: string; name: string }>;
} | null => {
  if (parentChain.length === 0) {
    return null;
  }

  const enrichedParents = parentChain.map((ref) => {
    const spanInfo = spanNameMap.get(ref.spanId);
    return {
      spanId: ref.spanId,
      name: spanInfo?.name || ref.name,
      count: spanInfo?.count,
    };
  });

  const displayPath =
    enrichedParents.length <= 3
      ? enrichedParents
      : [
          { spanId: "...", name: "..." },
          enrichedParents[enrichedParents.length - 2],
          enrichedParents[enrichedParents.length - 1],
        ];

  return {
    display: displayPath,
    full: parentChain,
  };
};

// ============================================================================
// Transcript List
// ============================================================================

export const toLightweight = (span: TraceViewSpan): TraceViewListSpan => ({
  spanId: span.spanId,
  parentSpanId: span.parentSpanId,
  spanType: span.spanType,
  name: span.name,
  model: span.model,
  path: span.path,
  startTime: span.startTime,
  endTime: span.endTime,
  inputTokens: span.inputTokens,
  outputTokens: span.outputTokens,
  cacheReadInputTokens: span.cacheReadInputTokens,
  totalCost: span.totalCost,
  pending: span.pending,
  status: span.status,
  inputSnippet: span.inputSnippet,
  outputSnippet: span.outputSnippet,
  attributesSnippet: span.attributesSnippet,
});

const NULL_SPAN_ID = "00000000-0000-0000-0000-000000000000";

type LlmSpanInfo = {
  spanId: string;
  parentSpanId: string;
  spanPath: string;
  spanPathLength: number;
  promptHash: string;
  /** Ancestor span ID distinguishing this invocation from other invocations of the same (path, hash). Filled by `computeInvocationRoots`. */
  invocationRoot: string;
  idsPath: string[];
  inputTokens: number;
  startTime: string;
};

export const MAIN_AGENT_SEARCH_WINDOW = 5;

const compositeKey = (parentSpanPath: string, promptHash: string, invocationRoot: string): string =>
  `${parentSpanPath}\0${promptHash}\0${invocationRoot}`;

const pathHashKey = (parentSpanPath: string, promptHash: string): string => `${parentSpanPath}\0${promptHash}`;

/**
 * For each cluster of LLMs sharing `(parentSpanPath, promptHash)`, return
 * each LLM's invocation root key: a string identifying the unique ancestor
 * chain that distinguishes its invocation from other invocations of the same
 * subagent. `""` means every member shares the same chain (one invocation).
 *
 * The key is the full structural portion of `ids_path` — every ancestor
 * except the last two positions (the LLM itself and its direct parent), which
 * are iteration noise: some SDKs reuse one loop body across iterations,
 * others spawn a fresh one per iteration; both are still one invocation.
 *
 * Using the full structural prefix (rather than a single divergence-index
 * value) correctly partitions a cluster with multiple divergence depths —
 * e.g. two invocations sharing depth-1 but diverging at depth-2 stay
 * separate even when a third invocation diverges from them at depth-1.
 */
const computeInvocationRoots = (cluster: LlmSpanInfo[]): Map<string, string> => {
  const out = new Map<string, string>();
  if (cluster.length <= 1) {
    if (cluster[0]) out.set(cluster[0].spanId, "");
    return out;
  }

  const structuralPrefix = (s: LlmSpanInfo): string => (s.idsPath.length <= 2 ? "" : s.idsPath.slice(0, -2).join("\0"));

  const keys = cluster.map(structuralPrefix);
  const firstKey = keys[0];
  if (keys.every((k) => k === firstKey)) {
    for (const s of cluster) out.set(s.spanId, "");
    return out;
  }
  for (let i = 0; i < cluster.length; i++) {
    out.set(cluster[i].spanId, keys[i]);
  }
  return out;
};

/**
 * Subagent grouping output.
 *
 * Each non-main LLM/CACHED span is keyed by `(parentSpanPath, promptHash, invocationRoot)`
 * and mapped to an anchor (the first LLM with that key by start time). The
 * main agent is picked by shortest `spanPath` among the first
 * `MAIN_AGENT_SEARCH_WINDOW` hashed LLMs (ties broken by highest input tokens)
 * and its (path, hash) is excluded across every invocation so it stays inline.
 *
 * `mainAgentAncestors` / `subagentAncestors` record every strict ancestor of
 * each LLM's `ids_path`, used by `buildSpanToAnchorMap` to place non-LLM spans
 * by their deepest claimed ancestor (main wins ties → standalone).
 */
interface SubagentLlmGrouping {
  /** LLM/CACHED spanId -> its anchor spanId. Main-agent LLMs are absent. */
  llmToAnchor: Map<string, string>;
  /** Span IDs claimed by the main agent (strict ancestors of main-agent LLMs). */
  mainAgentAncestors: Set<string>;
  /** Span ID -> anchor IDs of subagents whose LLM has that ID as a strict ancestor. */
  subagentAncestors: Map<string, Set<string>>;
  /** Anchor -> sorted LLM start times, for nearest-preceding-LLM tie-breaks. */
  anchorLlmTimes: Map<string, string[]>;
}

const computeSubagentBoundaries = (spans: TraceViewSpan[]): SubagentLlmGrouping => {
  const llmSpans: LlmSpanInfo[] = [];

  for (const span of spans) {
    if (span.spanType !== "LLM" && span.spanType !== "CACHED") continue;

    const promptHash = (span.attributes?.["lmnr.span.prompt_hash"] as string | undefined) ?? "";
    const idsPathRaw = span.attributes?.["lmnr.span.ids_path"] as string[] | undefined;
    const idsPath = Array.isArray(idsPathRaw) ? idsPathRaw.filter((id) => id !== NULL_SPAN_ID) : [];

    const spanPathAttr = span.attributes?.["lmnr.span.path"];
    const spanPathArr = Array.isArray(spanPathAttr) ? spanPathAttr : [];
    // Drop the trailing leaf — it can be dynamic (e.g. tool name per call) while
    // still being the same agent step. Must stay in sync with `arrayPopBack(splitByChar('.', path))`
    // in lib/actions/sessions/trace-io.ts (TOP_PATH_QUERY) and useTraceUserInput.
    const parentSpanPath = spanPathArr.slice(0, -1).join(".");

    llmSpans.push({
      spanId: span.spanId,
      parentSpanId: span.parentSpanId ?? "",
      spanPath: parentSpanPath,
      spanPathLength: spanPathArr.length,
      promptHash,
      invocationRoot: "", // filled in after path+hash clustering below
      idsPath,
      inputTokens: span.inputTokens ?? 0,
      startTime: span.startTime,
    });
  }

  if (llmSpans.length === 0) {
    return {
      llmToAnchor: new Map(),
      mainAgentAncestors: new Set(),
      subagentAncestors: new Map(),
      anchorLlmTimes: new Map(),
    };
  }

  llmSpans.sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Cluster by (path, hash) and fill each LLM's invocation root.
  const clusters = new Map<string, LlmSpanInfo[]>();
  for (const s of llmSpans) {
    const key = pathHashKey(s.spanPath, s.promptHash);
    let bucket = clusters.get(key);
    if (!bucket) {
      bucket = [];
      clusters.set(key, bucket);
    }
    bucket.push(s);
  }
  for (const bucket of clusters.values()) {
    const roots = computeInvocationRoots(bucket);
    for (const s of bucket) {
      s.invocationRoot = roots.get(s.spanId) ?? "";
    }
  }

  // Main agent: shortest path among the first N hashed LLMs, ties by input tokens.
  // Hashless spans are never main (unhashed prompts aren't a reliable identity).
  const hashedSearchWindow = llmSpans.filter((s) => s.promptHash !== "").slice(0, MAIN_AGENT_SEARCH_WINDOW);
  const mainSpan =
    hashedSearchWindow.length > 0
      ? hashedSearchWindow.reduce((best, s) => {
          if (s.spanPathLength < best.spanPathLength) return s;
          if (s.spanPathLength === best.spanPathLength && s.inputTokens > best.inputTokens) return s;
          return best;
        })
      : null;
  // Keyed by (path, hash) only so every main-agent invocation is suppressed.
  const mainPathHashKey = mainSpan ? pathHashKey(mainSpan.spanPath, mainSpan.promptHash) : null;
  const pathHashKeyOf = (s: LlmSpanInfo) => pathHashKey(s.spanPath, s.promptHash);

  // Anchor = first LLM (by start time) per full composite key, excluding main.
  const keyToAnchor = new Map<string, string>();
  for (const s of llmSpans) {
    if (pathHashKeyOf(s) === mainPathHashKey) continue;
    const key = compositeKey(s.spanPath, s.promptHash, s.invocationRoot);
    if (!keyToAnchor.has(key)) keyToAnchor.set(key, s.spanId);
  }

  // Record each LLM's strict ancestors against its agent (main or sub) so
  // `buildSpanToAnchorMap` can place non-LLM spans by deepest claimed ancestor.
  const llmToAnchor = new Map<string, string>();
  const mainAgentAncestors = new Set<string>();
  const subagentAncestors = new Map<string, Set<string>>();
  const anchorLlmTimes = new Map<string, string[]>();

  for (const s of llmSpans) {
    if (pathHashKeyOf(s) === mainPathHashKey) {
      for (let i = 0; i < s.idsPath.length - 1; i++) {
        mainAgentAncestors.add(s.idsPath[i]);
      }
      continue;
    }

    const key = compositeKey(s.spanPath, s.promptHash, s.invocationRoot);
    const anchor = keyToAnchor.get(key);
    if (!anchor) continue;
    llmToAnchor.set(s.spanId, anchor);

    for (let i = 0; i < s.idsPath.length - 1; i++) {
      const ancestorId = s.idsPath[i];
      let anchors = subagentAncestors.get(ancestorId);
      if (!anchors) {
        anchors = new Set();
        subagentAncestors.set(ancestorId, anchors);
      }
      anchors.add(anchor);
    }

    let times = anchorLlmTimes.get(anchor);
    if (!times) {
      times = [];
      anchorLlmTimes.set(anchor, times);
    }
    times.push(s.startTime);
  }

  return { llmToAnchor, mainAgentAncestors, subagentAncestors, anchorLlmTimes };
};

export interface CondensedSubagentGroup {
  /** Matches transcriptExpandedGroups keys (`group-<boundarySpanId>`). */
  groupId: string;
  /** All span IDs belonging to this subagent group (any span type). */
  spanIds: string[];
}

/**
 * Returns `{groupId, spanIds}` per subagent. LLM spans map via
 * `computeSubagentBoundaries`; non-LLM spans are placed by their deepest
 * claimed `ids_path` ancestor (see `buildSpanToAnchorMap`). Shares
 * `group-<anchorSpanId>` naming with `buildTranscriptListEntries` so the
 * condensed timeline can sync collapsed/expanded state.
 */
export const computeSubagentGroups = (allSpans: TraceViewSpan[]): CondensedSubagentGroup[] => {
  const grouping = computeSubagentBoundaries(allSpans);
  if (grouping.llmToAnchor.size === 0) return [];

  const spanToAnchor = buildSpanToAnchorMap(allSpans, grouping);

  const groupSpansMap = new Map<string, string[]>();
  for (const span of allSpans) {
    const anchor = spanToAnchor.get(span.spanId);
    if (!anchor) continue;
    let bucket = groupSpansMap.get(anchor);
    if (!bucket) {
      bucket = [];
      groupSpansMap.set(anchor, bucket);
    }
    bucket.push(span.spanId);
  }

  return Array.from(groupSpansMap.entries()).map(([anchor, spanIds]) => ({
    groupId: `group-${anchor}`,
    spanIds,
  }));
};

/**
 * Maps every span to its subagent anchor (or `undefined` for standalone).
 *
 * LLM/CACHED spans use `grouping.llmToAnchor` directly. Non-LLM spans walk
 * their `ids_path` strict ancestors (skipping the span's own ID, so a TOOL
 * that wraps a subagent doesn't claim itself) deepest-first and stop at the
 * first claimed ancestor. Main-agent claim wins ties → standalone. Multiple
 * subagent claims at one depth → nearest preceding LLM by start time.
 */
const buildSpanToAnchorMap = (allSpans: TraceViewSpan[], grouping: SubagentLlmGrouping): Map<string, string> => {
  const result = new Map<string, string>();
  for (const span of allSpans) {
    const anchor = grouping.llmToAnchor.get(span.spanId);
    if (anchor) result.set(span.spanId, anchor);
  }

  if (grouping.subagentAncestors.size === 0) return result;

  const resolveSubagent = (idsPath: string[], spanStartTime: string): string | null => {
    for (let i = idsPath.length - 2; i >= 0; i--) {
      const ancestorId = idsPath[i];
      if (grouping.mainAgentAncestors.has(ancestorId)) return null;

      const subClaims = grouping.subagentAncestors.get(ancestorId);
      if (!subClaims) continue;

      if (subClaims.size === 1) return subClaims.values().next().value!;

      // Multiple subagents claim this ancestor — pick the one whose most
      // recent LLM iteration started at or before this span.
      let chosen: string | null = null;
      let chosenTime = "";
      for (const anchor of subClaims) {
        const times = grouping.anchorLlmTimes.get(anchor);
        if (!times) continue;
        for (let j = times.length - 1; j >= 0; j--) {
          if (times[j] <= spanStartTime) {
            if (times[j] > chosenTime) {
              chosenTime = times[j];
              chosen = anchor;
            }
            break;
          }
        }
      }
      return chosen;
    }
    return null;
  };

  for (const span of allSpans) {
    if (result.has(span.spanId)) continue;
    if (span.spanType === "LLM" || span.spanType === "CACHED") continue;

    const idsPathAttr = span.attributes?.["lmnr.span.ids_path"] as string[] | undefined;
    const idsPath = Array.isArray(idsPathAttr) ? idsPathAttr.filter((id) => id !== NULL_SPAN_ID) : [];
    if (idsPath.length === 0) continue;

    const anchor = resolveSubagent(idsPath, span.startTime);
    if (anchor) result.set(span.spanId, anchor);
  }

  return result;
};

/**
 * Builds the flat list of transcript entries. Non-main LLM/CACHED spans anchor
 * subagent group blocks; non-LLM spans bundle in or stay standalone per
 * `buildSpanToAnchorMap`. Main-agent LLMs render inline.
 */
export const buildTranscriptListEntries = (
  allSpans: TraceViewSpan[],
  visibleSpanIds: Set<string>
): TranscriptListEntry[] => {
  const selectionFilteredSpans =
    visibleSpanIds.size === 0 ? allSpans : allSpans.filter((s) => visibleSpanIds.has(s.spanId));

  const listSpans = selectionFilteredSpans.filter((span) => span.spanType !== "DEFAULT");

  const grouping = computeSubagentBoundaries(allSpans);
  if (grouping.llmToAnchor.size === 0) {
    return listSpans.map((span): TranscriptListEntry => ({ type: "span", span: toLightweight(span) }));
  }

  const spanToAnchor = buildSpanToAnchorMap(allSpans, grouping);
  const spanMap = new Map<string, TraceViewSpan>();
  for (const s of allSpans) spanMap.set(s.spanId, s);

  // Bucket order matters: first/last-LLM detection below assumes start-time
  // order (the order spans arrive in `listSpans`).
  const groupSpansMap = new Map<string, TraceViewSpan[]>();
  for (const span of listSpans) {
    const anchor = spanToAnchor.get(span.spanId);
    if (!anchor) continue;
    let bucket = groupSpansMap.get(anchor);
    if (!bucket) {
      bucket = [];
      groupSpansMap.set(anchor, bucket);
    }
    bucket.push(span);
  }

  const emittedGroups = new Set<string>();
  const entries: TranscriptListEntry[] = [];

  const emitGroupBlock = (anchor: string) => {
    const groupSpans = groupSpansMap.get(anchor);
    if (!groupSpans || groupSpans.length === 0) return;

    let firstLlm: TraceViewSpan | undefined;
    let lastLlm: TraceViewSpan | undefined;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadInputTokens = 0;
    let totalCost = 0;
    for (const s of groupSpans) {
      if (s.spanType === "LLM" || s.spanType === "CACHED") {
        firstLlm ??= s;
        lastLlm = s;
      }
      inputTokens += s.inputTokens;
      outputTokens += s.outputTokens;
      cacheReadInputTokens += s.cacheReadInputTokens ?? 0;
      totalCost += s.totalCost;
    }

    // No LLM/CACHED left after visibility filtering — degrade to standalone
    // rows so the user still sees the spans.
    if (!firstLlm) {
      for (const s of groupSpans) {
        entries.push({ type: "span", span: toLightweight(s) });
      }
      return;
    }

    const anchorSpan = spanMap.get(anchor);
    const lightSpans = groupSpans.map((s) => toLightweight(s));
    const groupId = `group-${anchor}`;

    entries.push({
      type: "group",
      groupId,
      name: anchorSpan?.name ?? groupSpans[0].name,
      path: anchorSpan?.path ?? "",
      firstSpan: lightSpans[0],
      firstLlmSpanId: firstLlm.spanId,
      lastLlmSpanId: lastLlm && lastLlm.spanId !== firstLlm.spanId ? lastLlm.spanId : null,
      startTime: groupSpans[0].startTime,
      endTime: groupSpans[groupSpans.length - 1].endTime,
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
      totalCost,
    });

    entries.push({ type: "group-input", groupId, firstLlmSpanId: firstLlm.spanId });

    for (let i = 0; i < lightSpans.length; i++) {
      entries.push({
        type: "group-span",
        span: lightSpans[i],
        groupId,
        isLast: i === lightSpans.length - 1,
      });
    }
  };

  for (const span of listSpans) {
    const anchor = spanToAnchor.get(span.spanId);
    if (!anchor) {
      entries.push({ type: "span", span: toLightweight(span) });
      continue;
    }
    if (emittedGroups.has(anchor)) continue;
    emittedGroups.add(anchor);
    emitGroupBlock(anchor);
  }

  return entries;
};

// ============================================================================
// Condensed Timeline Types and Functions
// ============================================================================

export interface CondensedTimelineSpan {
  span: TraceViewSpan;
  left: number; // percentage (0-100)
  width: number; // percentage (0-100)
  row: number; // computed row after gravity
  originalDepth: number; // tree depth before condensing
  parentSpanId?: string;
}

export interface CondensedTimelineData {
  spans: CondensedTimelineSpan[];
  startTime: number;
  endTime: number;
  totalRows: number;
  timelineWidthInMilliseconds: number;
  totalDurationMs: number;
}

/**
 * Computes the visible span IDs by adding all ancestors of selected spans.
 * This ensures tree views maintain hierarchy when filtering.
 */
export const computeVisibleSpanIds = (selectedIds: Set<string>, spans: TraceViewSpan[]): Set<string> => {
  if (selectedIds.size === 0) return new Set();

  const visibleIds = new Set(selectedIds);
  const spanMap = new Map(spans.map((s) => [s.spanId, s]));

  // For each selected span, walk up to root adding ancestors
  for (const spanId of selectedIds) {
    let current = spanMap.get(spanId);
    while (current?.parentSpanId) {
      visibleIds.add(current.parentSpanId);
      current = spanMap.get(current.parentSpanId);
    }
  }

  return visibleIds;
};

/**
 * Transforms spans into a condensed timeline layout using a gravity algorithm.
 * Spans are compacted vertically while maintaining the parent-child hierarchy invariant
 * (children never appear above their parents).
 */
export const transformSpansToCondensedTimeline = (spans: TraceViewSpan[]): CondensedTimelineData => {
  if (spans.length === 0) {
    return {
      spans: [],
      startTime: 0,
      endTime: 0,
      totalRows: 0,
      timelineWidthInMilliseconds: 0,
      totalDurationMs: 0,
    };
  }

  // Calculate time bounds
  let startTime = Infinity;
  let endTime = -Infinity;

  for (const span of spans) {
    startTime = Math.min(startTime, new Date(span.startTime).getTime());
    endTime = Math.max(endTime, new Date(span.endTime).getTime());
  }

  const totalDuration = endTime - startTime;
  const upperIntervalInSeconds = Math.ceil(totalDuration / 1000);
  const upperIntervalInMilliseconds = upperIntervalInSeconds * 1000;

  // Build parent lookup and compute original tree depths
  const spanMap = new Map(spans.map((s) => [s.spanId, s]));
  const childSpansMap = getChildSpansMap(spans);

  // Compute original depths using DFS from root spans
  const depthMap = new Map<string, number>();
  const computeDepth = (spanId: string, depth: number) => {
    depthMap.set(spanId, depth);
    const children = childSpansMap[spanId] || [];
    for (const child of children) {
      computeDepth(child.spanId, depth + 1);
    }
  };

  const topLevelSpans = spans.filter((span) => !span.parentSpanId);
  for (const span of topLevelSpans) {
    computeDepth(span.spanId, 0);
  }

  type SpanWithPosition = {
    span: TraceViewSpan;
    left: number;
    width: number;
    originalDepth: number;
    startMs: number;
    endMs: number;
  };

  // spanId -> position map keeps the DFS-ordering pass below O(N).
  const positionById = new Map<string, SpanWithPosition>();
  for (const span of spans) {
    const spanStartMs = new Date(span.startTime).getTime();
    const spanEndMs = new Date(span.endTime).getTime();
    const spanDuration = spanEndMs - spanStartMs;

    const left = ((spanStartMs - startTime) / upperIntervalInMilliseconds) * 100;
    const width = (spanDuration / upperIntervalInMilliseconds) * 100;

    positionById.set(span.spanId, {
      span,
      left,
      width,
      originalDepth: depthMap.get(span.spanId) ?? 0,
      startMs: spanStartMs,
      endMs: spanEndMs,
    });
  }

  const orderedSpans: SpanWithPosition[] = [];
  const visited = new Set<string>();

  const dfsOrder = (spanId: string) => {
    if (visited.has(spanId)) return;
    visited.add(spanId);

    const spanWithPos = positionById.get(spanId);
    if (spanWithPos) {
      orderedSpans.push(spanWithPos);
    }

    const children = childSpansMap[spanId] || [];
    for (const child of children) {
      dfsOrder(child.spanId);
    }
  };

  for (const span of topLevelSpans) {
    dfsOrder(span.spanId);
  }

  // Gravity algorithm: compact spans upward while respecting parent-child invariant
  const rowAssignments = new Map<string, number>();
  const rowOccupancy: Array<Array<{ left: number; right: number; spanId: string }>> = [];

  // Helper to check if a span overlaps with any existing span in a row
  const hasOverlap = (row: number, left: number, right: number, excludeSpanId?: string): boolean => {
    if (!rowOccupancy[row]) return false;
    return rowOccupancy[row].some(
      (occupant) => occupant.spanId !== excludeSpanId && !(right <= occupant.left || left >= occupant.right)
    );
  };

  // Helper to get parent's row (returns -1 if no parent)
  const getParentRow = (spanId: string): number => {
    const span = spanMap.get(spanId);
    if (!span?.parentSpanId) return -1;
    return rowAssignments.get(span.parentSpanId) ?? -1;
  };

  for (const item of orderedSpans) {
    const parentRow = getParentRow(item.span.spanId);
    const minRow = parentRow + 1; // Child must be at least one row below parent

    // Find the lowest valid row (closest to top)
    let targetRow = minRow;
    const leftBound = item.left;
    const rightBound = item.left + item.width;

    while (hasOverlap(targetRow, leftBound, rightBound)) {
      targetRow++;
    }

    // Assign the row
    rowAssignments.set(item.span.spanId, targetRow);

    // Mark the row as occupied
    if (!rowOccupancy[targetRow]) {
      rowOccupancy[targetRow] = [];
    }
    rowOccupancy[targetRow].push({
      left: leftBound,
      right: rightBound,
      spanId: item.span.spanId,
    });
  }

  // Build final result
  const condensedSpans: CondensedTimelineSpan[] = orderedSpans.map((item) => ({
    span: item.span,
    left: item.left,
    width: item.width,
    row: rowAssignments.get(item.span.spanId) ?? 0,
    originalDepth: item.originalDepth,
    parentSpanId: item.span.parentSpanId,
  }));

  const totalRows = rowOccupancy.length;

  return {
    spans: condensedSpans,
    startTime,
    endTime,
    totalRows,
    timelineWidthInMilliseconds: upperIntervalInMilliseconds,
    totalDurationMs: totalDuration,
  };
};
