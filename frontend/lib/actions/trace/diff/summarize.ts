"use server";

import { google } from "@ai-sdk/google";
import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { fetchSpanInfos, fetchSpans } from "@/lib/actions/trace/agent/spans";

import {
  buildAnnotatedTree,
  buildCollapsedSkeleton,
  buildCollapsedYaml,
  buildSubSkeleton,
  buildSubYaml,
  collectSubtreeSpanIds,
  findPartitionPoints,
  identifyNonLeafBlocks,
} from "./partition";
import { BLOCK_SUMMARY_SYSTEM_PROMPT, PHASE1_SYSTEM_PROMPT } from "./summarize-prompt";

const PARTITION_THRESHOLD = 20;

const BlockSummaryResultSchema = z.object({
  results: z.array(
    z.object({
      blockId: z.string(),
      summary: z.string(),
      icon: z.string(),
    })
  ),
});

const PartitionResultSchema = z.object({
  deepSummary: z.string(),
  results: z.array(
    z.object({
      blockId: z.string(),
      summary: z.string(),
      icon: z.string(),
    })
  ),
});

export interface BlockSummaryInput {
  blockId: string;
  spanName: string;
  spanType: string;
  descendantNames: string[];
  descendantTypes: string[];
}

export type BlockSummaryResult = z.infer<typeof BlockSummaryResultSchema>["results"][number];

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildBlockDescriptions(blocks: BlockSummaryInput[]): string {
  return blocks
    .map(
      (b) =>
        `Block ${b.blockId}: name="${b.spanName}", type=${b.spanType}, descendants=[${b.descendantNames.map((n, i) => `${n}(${b.descendantTypes[i]})`).join(", ")}]`
    )
    .join("\n");
}

// ─── Partition plan ─────────────────────────────────────────────────────────

/** A single partition: the root spanId and which requested blocks fall inside it. */
export interface PartitionDescriptor {
  rootSpanId: string;
  blockIds: string[];
}

/** Result of planning: either partitioned (multiple partitions) or null (small trace). */
export interface PartitionPlan {
  partitions: PartitionDescriptor[];
  /** Block IDs that are above all partitions (need Phase 2). */
  topLevelBlockIds: string[];
}

/**
 * Analyze the trace tree, decide whether to partition, and return the plan.
 * No LLM calls — just ClickHouse queries + tree logic.
 */
export async function planPartitions(
  projectId: string,
  traceId: string,
  blocks: BlockSummaryInput[]
): Promise<PartitionPlan | null> {
  if (blocks.length === 0) return null;

  const spanInfos = await fetchSpanInfos(projectId, traceId);
  const roots = buildAnnotatedTree(spanInfos);
  const partitionPoints = findPartitionPoints(roots, PARTITION_THRESHOLD);

  // No parallelism benefit — caller should use summarizeBlocks directly
  if (partitionPoints.size <= 1) return null;

  const requestedBlockIds = new Set(blocks.map((b) => b.blockId));
  const partitions: PartitionDescriptor[] = [];
  const allPartitionSpanIds = new Set<string>();

  for (const rootId of partitionPoints) {
    const subtreeIds = collectSubtreeSpanIds(roots, rootId);
    for (const id of subtreeIds) allPartitionSpanIds.add(id);

    const nonLeafBlockIds = identifyNonLeafBlocks(spanInfos, subtreeIds);
    const blockIds = blocks
      .filter(
        (b) => subtreeIds.has(b.blockId) && nonLeafBlockIds.includes(b.blockId) && requestedBlockIds.has(b.blockId)
      )
      .map((b) => b.blockId);

    partitions.push({ rootSpanId: rootId, blockIds });
  }

  const topLevelBlockIds = blocks.filter((b) => !allPartitionSpanIds.has(b.blockId)).map((b) => b.blockId);

  return { partitions, topLevelBlockIds };
}

// ─── Single partition summarization ─────────────────────────────────────────

export interface PartitionSummaryResult {
  rootSpanId: string;
  deepSummary: string;
  results: BlockSummaryResult[];
}

/**
 * Summarize blocks within a single partition subtree.
 * One LLM call. Returns block summaries + a deepSummary for the partition root.
 */
export async function summarizePartition(
  projectId: string,
  traceId: string,
  partitionRootSpanId: string,
  blocks: BlockSummaryInput[]
): Promise<PartitionSummaryResult> {
  const spanInfos = await fetchSpanInfos(projectId, traceId);
  const llmToolIds = spanInfos.filter((s) => s.type === "LLM" || s.type === "TOOL").map((s) => s.spanId);
  const spansMap = await fetchSpans(projectId, traceId, llmToolIds);
  const roots = buildAnnotatedTree(spanInfos);

  const subtreeIds = collectSubtreeSpanIds(roots, partitionRootSpanId);
  const { skeleton, localSeqIdMap } = buildSubSkeleton(spanInfos, subtreeIds);
  const yaml = buildSubYaml(spanInfos, spansMap, subtreeIds, localSeqIdMap);

  const blockDescriptions =
    blocks.length > 0 ? buildBlockDescriptions(blocks) : "(no blocks to label in this partition)";

  const prompt = `<trace_context>
Here is the skeleton view of this subtree:
<trace_skeleton>
${skeleton}
</trace_skeleton>

Here are the detailed views of LLM and Tool spans:
<spans>
${yaml}
</spans>
</trace_context>

Label these blocks:
${blockDescriptions}

Respond with ONLY a JSON object with "deepSummary" (1-2 sentence summary of the entire subtree) and "results" array.`;

  const { object } = await observe({ name: "generateBlockSummaries:partition" }, async () =>
    generateObject({
      model: google("gemini-3-flash-preview"),
      schema: PartitionResultSchema,
      system: PHASE1_SYSTEM_PROMPT,
      prompt,
      experimental_telemetry: { isEnabled: true, tracer: getTracer() },
    })
  );

  return {
    rootSpanId: partitionRootSpanId,
    deepSummary: object.deepSummary,
    results: object.results,
  };
}

// ─── Top-level summarization (Phase 2) ──────────────────────────────────────

/**
 * Summarize blocks above the partition cut, using deep summaries from partitions
 * as collapsed context. One LLM call.
 */
export async function summarizeTopLevel(
  projectId: string,
  traceId: string,
  blocks: BlockSummaryInput[],
  deepSummaries: Record<string, string>,
  partitionRootIds: string[]
): Promise<BlockSummaryResult[]> {
  if (blocks.length === 0) return [];

  const spanInfos = await fetchSpanInfos(projectId, traceId);
  const llmToolIds = spanInfos.filter((s) => s.type === "LLM" || s.type === "TOOL").map((s) => s.spanId);
  const spansMap = await fetchSpans(projectId, traceId, llmToolIds);
  const roots = buildAnnotatedTree(spanInfos);

  const partitionSubtrees = new Map<string, Set<string>>();
  for (const rootId of partitionRootIds) {
    partitionSubtrees.set(rootId, collectSubtreeSpanIds(roots, rootId));
  }

  const allPartitionSpanIds = new Set<string>();
  for (const subtreeIds of partitionSubtrees.values()) {
    for (const id of subtreeIds) allPartitionSpanIds.add(id);
  }

  const deepSummariesMap = new Map(Object.entries(deepSummaries));
  const collapsedSkeleton = buildCollapsedSkeleton(spanInfos, deepSummariesMap, partitionSubtrees);
  const collapsedYaml = buildCollapsedYaml(spanInfos, spansMap, allPartitionSpanIds);

  const prompt = `<trace_context>
Here is the skeleton view of the trace (partition subtrees collapsed with summaries):
<trace_skeleton>
${collapsedSkeleton}
</trace_skeleton>

Here are the detailed views of LLM and Tool spans (outside partitions):
<spans>
${collapsedYaml}
</spans>
</trace_context>

Label these blocks:
${buildBlockDescriptions(blocks)}

Respond with ONLY a JSON object in this exact format, no other text:
{"results": [{"blockId": "<id>", "summary": "<2-7 word label>", "icon": "<icon name>"}]}`;

  const { object } = await observe({ name: "generateBlockSummaries:topLevel" }, async () =>
    generateObject({
      model: google("gemini-3-flash-preview"),
      schema: BlockSummaryResultSchema,
      system: BLOCK_SUMMARY_SYSTEM_PROMPT,
      prompt,
      experimental_telemetry: { isEnabled: true, tracer: getTracer() },
    })
  );

  return object.results;
}

// ─── Small-trace fallback (no partitioning) ─────────────────────────────────

/**
 * Summarize all blocks in a single request. Used when the trace is small
 * enough that partitioning has no benefit.
 */
export async function summarizeBlocks(
  projectId: string,
  traceId: string,
  blocks: BlockSummaryInput[]
): Promise<BlockSummaryResult[]> {
  if (blocks.length === 0) return [];

  const spanInfos = await fetchSpanInfos(projectId, traceId);
  const llmToolIds = spanInfos.filter((s) => s.type === "LLM" || s.type === "TOOL").map((s) => s.spanId);
  const spansMap = await fetchSpans(projectId, traceId, llmToolIds);

  const allIds = new Set(spanInfos.map((s) => s.spanId));
  const { skeleton, localSeqIdMap } = buildSubSkeleton(spanInfos, allIds);
  const yaml = buildSubYaml(spanInfos, spansMap, allIds, localSeqIdMap);

  const traceString = `Here is the skeleton view of the trace:
<trace_skeleton>
${skeleton}
</trace_skeleton>

Here are the detailed views of LLM and Tool spans:
<spans>
${yaml}
</spans>
`;

  const prompt = `<trace_context>
${traceString}
</trace_context>

Label these blocks:
${buildBlockDescriptions(blocks)}

Respond with ONLY a JSON object in this exact format, no other text:
{"results": [{"blockId": "<id>", "summary": "<2-7 word label>", "icon": "<icon name>"}]}`;

  const { object } = await observe({ name: "generateBlockSummaries" }, async () =>
    generateObject({
      model: google("gemini-3-flash-preview"),
      schema: BlockSummaryResultSchema,
      system: BLOCK_SUMMARY_SYSTEM_PROMPT,
      prompt,
      experimental_telemetry: { isEnabled: true, tracer: getTracer() },
    })
  );

  return object.results;
}
