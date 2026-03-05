/**
 * Benchmark: measures end-to-end time for partitioned block summarization.
 *
 * Fetches real trace data from ClickHouse, builds partition contexts,
 * then fires the actual Gemini LLM calls (Phase 1 parallel + Phase 2).
 *
 * Run: pnpm tsx tests/benchmark-summarize.ts
 */

import { google } from "@ai-sdk/google";
import { createClient } from "@clickhouse/client";
import { generateObject } from "ai";
import * as dotenv from "dotenv";
import * as path from "path";
import { z } from "zod";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import type { Span,SpanInfo } from "@/lib/actions/trace/agent/spans";
import {
  buildAnnotatedTree,
  buildCollapsedSkeleton,
  buildCollapsedYaml,
  buildSubSkeleton,
  buildSubYaml,
  collectSubtreeSpanIds,
  findPartitionPoints,
  identifyNonLeafBlocks,
} from "@/lib/actions/trace/diff/partition";
import { BLOCK_SUMMARY_SYSTEM_PROMPT, PHASE1_SYSTEM_PROMPT } from "@/lib/actions/trace/diff/summarize-prompt";

const PARTITION_THRESHOLD = 20;

const PROJECT_ID = "0bb53558-f560-4417-ad00-51d80501f56a";

// Claude Agent SDK traces (large, 219 and 191 spans)
const TRACES = [
  { label: "Claude Agent SDK - Left (219 spans)", traceId: "205609a4-437f-f5a0-f45f-2f7a3f7e06a6" },
  { label: "Claude Agent SDK - Right (191 spans)", traceId: "8991e7a1-8c8f-836a-9803-1ef2ab229c07" },
];

const client = createClient({
  url: process.env.CLICKHOUSE_URL!,
  username: process.env.CLICKHOUSE_USER!,
  password: process.env.CLICKHOUSE_PASSWORD!,
});

const BlockSummaryResultSchema = z.object({
  results: z.array(z.object({ blockId: z.string(), summary: z.string(), icon: z.string() })),
});
const Phase1ResultSchema = z.object({
  deepSummary: z.string(),
  results: z.array(z.object({ blockId: z.string(), summary: z.string(), icon: z.string() })),
});

async function fetchSpanInfos(projectId: string, traceId: string): Promise<SpanInfo[]> {
  const result = await client.query({
    query: `
      SELECT span_id as spanId, name,
        CASE WHEN span_type=0 THEN 'DEFAULT' WHEN span_type=1 THEN 'LLM'
             WHEN span_type=3 THEN 'EXECUTOR' WHEN span_type=4 THEN 'EVALUATOR'
             WHEN span_type=5 THEN 'EVALUATION' WHEN span_type=6 THEN 'TOOL'
             WHEN span_type=7 THEN 'HUMAN_EVALUATOR' WHEN span_type=8 THEN 'CACHED'
             ELSE 'UNKNOWN' END as type,
        path, start_time as start, end_time as end,
        CASE WHEN status='error' THEN 'error' ELSE 'success' END as status,
        parent_span_id as parent
      FROM spans WHERE trace_id={trace_id:UUID} AND project_id={project_id:UUID}
      ORDER BY start_time ASC`,
    query_params: { trace_id: traceId, project_id: projectId },
    format: "JSONEachRow",
  });
  return (await result.json()) as SpanInfo[];
}

async function fetchSpanDetails(projectId: string, traceId: string, spanIds: string[]): Promise<Map<string, Span>> {
  if (spanIds.length === 0) return new Map();
  const result = await client.query({
    query: `
      SELECT span_id as spanId, name,
        CASE WHEN span_type=0 THEN 'DEFAULT' WHEN span_type=1 THEN 'LLM'
             WHEN span_type=3 THEN 'EXECUTOR' WHEN span_type=4 THEN 'EVALUATOR'
             WHEN span_type=5 THEN 'EVALUATION' WHEN span_type=6 THEN 'TOOL'
             WHEN span_type=7 THEN 'HUMAN_EVALUATOR' WHEN span_type=8 THEN 'CACHED'
             ELSE 'UNKNOWN' END as type,
        path, start_time as start, end_time as end,
        CASE WHEN status='error' THEN 'error' ELSE 'success' END as status,
        parent_span_id as parent, input, output
      FROM spans WHERE trace_id={trace_id:UUID} AND project_id={project_id:UUID}
        AND span_id IN {span_ids:Array(UUID)}`,
    query_params: { trace_id: traceId, project_id: projectId, span_ids: spanIds },
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as any[];
  const map = new Map<string, Span>();
  for (const row of rows) {
    let input: unknown, output: unknown;
    try {
      input = JSON.parse(row.input);
    } catch {
      input = row.input;
    }
    try {
      output = JSON.parse(row.output);
    } catch {
      output = row.output;
    }
    map.set(row.spanId, { ...row, input, output });
  }
  return map;
}

/** Simulate getAllCondensedBlockInputs: find all non-leaf spans. */
function buildBlockInputs(spanInfos: SpanInfo[]) {
  const childCount = new Map<string, number>();
  for (const s of spanInfos) childCount.set(s.spanId, 0);
  for (const s of spanInfos) {
    if (s.parent && childCount.has(s.parent)) {
      childCount.set(s.parent, (childCount.get(s.parent) ?? 0) + 1);
    }
  }

  const childrenOf = new Map<string, SpanInfo[]>();
  for (const s of spanInfos) {
    if (s.parent && childCount.has(s.parent)) {
      if (!childrenOf.has(s.parent)) childrenOf.set(s.parent, []);
      childrenOf.get(s.parent)!.push(s);
    }
  }

  function collectDescendants(spanId: string): { names: string[]; types: string[] } {
    const names: string[] = [];
    const types: string[] = [];
    function walk(id: string) {
      for (const child of childrenOf.get(id) ?? []) {
        names.push(child.name);
        types.push(child.type);
        walk(child.spanId);
      }
    }
    walk(spanId);
    return { names, types };
  }

  const blocks: {
    blockId: string;
    spanName: string;
    spanType: string;
    descendantNames: string[];
    descendantTypes: string[];
  }[] = [];
  for (const s of spanInfos) {
    if ((childCount.get(s.spanId) ?? 0) > 0) {
      const { names, types } = collectDescendants(s.spanId);
      blocks.push({
        blockId: s.spanId,
        spanName: s.name,
        spanType: s.type,
        descendantNames: names,
        descendantTypes: types,
      });
    }
  }
  return blocks;
}

function fmt(ms: number) {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

async function benchmarkTrace(label: string, traceId: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Benchmarking: ${label}`);
  console.log("=".repeat(70));

  const t0 = performance.now();

  // 1. Fetch data
  const spanInfos = await fetchSpanInfos(PROJECT_ID, traceId);
  const llmToolIds = spanInfos.filter((s) => s.type === "LLM" || s.type === "TOOL").map((s) => s.spanId);
  const spansMap = await fetchSpanDetails(PROJECT_ID, traceId, llmToolIds);
  const tFetch = performance.now();
  console.log(`  Data fetch: ${fmt(tFetch - t0)} (${spanInfos.length} spans, ${spansMap.size} LLM/TOOL details)`);

  // 2. Build blocks + partition
  const blocks = buildBlockInputs(spanInfos);
  const roots = buildAnnotatedTree(spanInfos);
  const partitionPoints = findPartitionPoints(roots, PARTITION_THRESHOLD);
  const tPartition = performance.now();
  console.log(
    `  Partition logic: ${fmt(tPartition - tFetch)} (${partitionPoints.size} partitions, ${blocks.length} blocks)`
  );

  if (partitionPoints.size === 0) {
    console.log("  No partitioning needed — would use single request. Skipping LLM benchmark.");
    return;
  }

  // 3. Phase 1: parallel LLM calls
  const partitionSubtrees = new Map<string, Set<string>>();
  for (const pp of partitionPoints) {
    partitionSubtrees.set(pp, collectSubtreeSpanIds(roots, pp));
  }

  const allPartitionSpanIds = new Set<string>();
  for (const subtreeIds of partitionSubtrees.values()) {
    for (const id of subtreeIds) allPartitionSpanIds.add(id);
  }

  const requestedBlockIds = new Set(blocks.map((b) => b.blockId));

  const tPhase1Start = performance.now();
  const phase1Promises: Promise<{ partitionRootId: string; deepSummary: string; results: any[]; duration: number }>[] =
    [];

  for (const [partitionRootId, subtreeIds] of partitionSubtrees) {
    const nonLeafBlockIds = identifyNonLeafBlocks(spanInfos, subtreeIds);
    const blocksInPartition = blocks.filter(
      (b) => subtreeIds.has(b.blockId) && nonLeafBlockIds.includes(b.blockId) && requestedBlockIds.has(b.blockId)
    );

    const { skeleton, localSeqIdMap } = buildSubSkeleton(spanInfos, subtreeIds);
    const yaml = buildSubYaml(spanInfos, spansMap, subtreeIds, localSeqIdMap);

    const blockDescriptions =
      blocksInPartition.length > 0
        ? blocksInPartition
            .map(
              (b) =>
                `Block ${b.blockId}: name="${b.spanName}", type=${b.spanType}, descendants=[${b.descendantNames.map((n, i) => `${n}(${b.descendantTypes[i]})`).join(", ")}]`
            )
            .join("\n")
        : "(no blocks to label in this partition)";

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

    const partName = spanInfos.find((s) => s.spanId === partitionRootId)!.name;
    const promptChars = prompt.length;

    const p1Start = performance.now();
    const promise = generateObject({
      model: google("gemini-3-flash-preview"),
      schema: Phase1ResultSchema,
      system: PHASE1_SYSTEM_PROMPT,
      prompt,
    }).then(({ object }) => {
      const dur = performance.now() - p1Start;
      console.log(
        `    Phase 1 [${partName}]: ${fmt(dur)} (prompt: ${(promptChars / 1000).toFixed(1)}k chars, ${object.results.length} results)`
      );
      return { partitionRootId, deepSummary: object.deepSummary, results: object.results, duration: dur };
    });

    phase1Promises.push(promise);
  }

  const phase1Results = await Promise.all(phase1Promises);
  const tPhase1End = performance.now();
  const phase1WallTime = tPhase1End - tPhase1Start;
  const phase1TotalSerial = phase1Results.reduce((sum, r) => sum + r.duration, 0);
  console.log(
    `  Phase 1 total: ${fmt(phase1WallTime)} wall / ${fmt(phase1TotalSerial)} serial (${phase1Results.length} parallel calls)`
  );

  // 4. Phase 2: collapsed context
  const deepSummaries = new Map<string, string>();
  for (const { partitionRootId, deepSummary } of phase1Results) {
    deepSummaries.set(partitionRootId, deepSummary);
  }

  const blocksAbove = blocks.filter((b) => !allPartitionSpanIds.has(b.blockId));

  let phase2Duration = 0;
  if (blocksAbove.length > 0) {
    const collapsedSkeleton = buildCollapsedSkeleton(spanInfos, deepSummaries, partitionSubtrees);
    const collapsedYaml = buildCollapsedYaml(spanInfos, spansMap, allPartitionSpanIds);

    const blockDescriptions = blocksAbove
      .map(
        (b) =>
          `Block ${b.blockId}: name="${b.spanName}", type=${b.spanType}, descendants=[${b.descendantNames.map((n, i) => `${n}(${b.descendantTypes[i]})`).join(", ")}]`
      )
      .join("\n");

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
${blockDescriptions}

Respond with ONLY a JSON object in this exact format, no other text:
{"results": [{"blockId": "<id>", "summary": "<2-7 word label>", "icon": "<icon name>"}]}`;

    const tP2Start = performance.now();
    const { object } = await generateObject({
      model: google("gemini-3-flash-preview"),
      schema: BlockSummaryResultSchema,
      system: BLOCK_SUMMARY_SYSTEM_PROMPT,
      prompt,
    });
    phase2Duration = performance.now() - tP2Start;
    console.log(
      `  Phase 2: ${fmt(phase2Duration)} (${blocksAbove.length} blocks, prompt: ${(prompt.length / 1000).toFixed(1)}k chars, ${object.results.length} results)`
    );
  } else {
    console.log("  Phase 2: skipped (no blocks above partitions)");
  }

  const tEnd = performance.now();
  const totalLLM = phase1WallTime + phase2Duration;
  const totalE2E = tEnd - t0;

  console.log(`\n  ── Summary ──`);
  console.log(`  Data fetch:      ${fmt(tFetch - t0)}`);
  console.log(`  Partition logic: ${fmt(tPartition - tFetch)}`);
  console.log(`  Phase 1 (wall):  ${fmt(phase1WallTime)}`);
  console.log(`  Phase 2:         ${fmt(phase2Duration)}`);
  console.log(`  Total LLM:       ${fmt(totalLLM)}`);
  console.log(`  Total E2E:       ${fmt(totalE2E)}`);
  console.log(`  Saved vs serial: ${fmt(phase1TotalSerial - phase1WallTime)} (parallel savings)`);
}

/** Also benchmark the OLD approach: single request with full context. */
async function benchmarkSingleRequest(label: string, traceId: string) {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`Baseline (single request): ${label}`);
  console.log("─".repeat(70));

  const t0 = performance.now();
  const spanInfos = await fetchSpanInfos(PROJECT_ID, traceId);
  const llmToolIds = spanInfos.filter((s) => s.type === "LLM" || s.type === "TOOL").map((s) => s.spanId);
  const spansMap = await fetchSpanDetails(PROJECT_ID, traceId, llmToolIds);
  const tFetch = performance.now();

  const blocks = buildBlockInputs(spanInfos);
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
</spans>`;

  const blockDescriptions = blocks
    .map(
      (b) =>
        `Block ${b.blockId}: name="${b.spanName}", type=${b.spanType}, descendants=[${b.descendantNames.map((n, i) => `${n}(${b.descendantTypes[i]})`).join(", ")}]`
    )
    .join("\n");

  const prompt = `<trace_context>
${traceString}
</trace_context>

Label these blocks:
${blockDescriptions}

Respond with ONLY a JSON object in this exact format, no other text:
{"results": [{"blockId": "<id>", "summary": "<2-7 word label>", "icon": "<icon name>"}]}`;

  console.log(`  Prompt size: ${(prompt.length / 1000).toFixed(1)}k chars, ${blocks.length} blocks`);

  const tLLMStart = performance.now();
  const { object } = await generateObject({
    model: google("gemini-3-flash-preview"),
    schema: BlockSummaryResultSchema,
    system: BLOCK_SUMMARY_SYSTEM_PROMPT,
    prompt,
  });
  const tLLMEnd = performance.now();

  console.log(`  Data fetch: ${fmt(tFetch - t0)}`);
  console.log(`  LLM call:   ${fmt(tLLMEnd - tLLMStart)} (${object.results.length} results)`);
  console.log(`  Total E2E:  ${fmt(tLLMEnd - t0)}`);
}

async function main() {
  console.log("Partitioned Parallel Block Summarization Benchmark");
  console.log(`Threshold: ${PARTITION_THRESHOLD} LLM/TOOL descendants\n`);

  for (const { label, traceId } of TRACES) {
    // First: baseline (single request)
    await benchmarkSingleRequest(label, traceId);
    // Then: partitioned approach
    await benchmarkTrace(label, traceId);
  }

  console.log("\n" + "=".repeat(70));
  console.log("BENCHMARK COMPLETE");
  console.log("=".repeat(70));
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
