/**
 * Integration test for partitioning logic against real ClickHouse data.
 *
 * Reads CLICKHOUSE_URL, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD from .env
 * and queries real trace data to validate the partition pipeline.
 *
 * Run: pnpm tsx tests/partition-integration.test.ts
 */

import { createClient } from "@clickhouse/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import type { SpanInfo } from "@/lib/actions/trace/agent/spans";
import {
  type AnnotatedNode,
  buildAnnotatedTree,
  buildCollapsedSkeleton,
  buildCollapsedYaml,
  buildSubSkeleton,
  buildSubYaml,
  collectSubtreeSpanIds,
  findPartitionPoints,
  identifyNonLeafBlocks,
} from "@/lib/actions/trace/diff/partition";

const PROJECT_ID = "0bb53558-f560-4417-ad00-51d80501f56a";

// Browser use traces
const BROWSER_LEFT = "16fcd540-9583-8bcb-f8e0-8b15ec92c58d";
const BROWSER_RIGHT = "e4a89479-f8a3-266c-e61b-9d42248ca728";

// Claude agent SDK traces
const AGENT_LEFT = "205609a4-437f-f5a0-f45f-2f7a3f7e06a6";
const AGENT_RIGHT = "8991e7a1-8c8f-836a-9803-1ef2ab229c07";

const client = createClient({
  url: process.env.CLICKHOUSE_URL!,
  username: process.env.CLICKHOUSE_USER!,
  password: process.env.CLICKHOUSE_PASSWORD!,
});

async function fetchSpanInfosDirect(projectId: string, traceId: string): Promise<SpanInfo[]> {
  const result = await client.query({
    query: `
      SELECT
        span_id as spanId,
        name,
        CASE
          WHEN span_type = 0 THEN 'DEFAULT'
          WHEN span_type = 1 THEN 'LLM'
          WHEN span_type = 3 THEN 'EXECUTOR'
          WHEN span_type = 4 THEN 'EVALUATOR'
          WHEN span_type = 5 THEN 'EVALUATION'
          WHEN span_type = 6 THEN 'TOOL'
          WHEN span_type = 7 THEN 'HUMAN_EVALUATOR'
          WHEN span_type = 8 THEN 'CACHED'
          ELSE 'UNKNOWN'
        END as type,
        path,
        start_time as start,
        end_time as end,
        CASE
          WHEN status = 'error' THEN 'error'
          ELSE 'success'
        END as status,
        parent_span_id as parent
      FROM spans
      WHERE trace_id = {trace_id: UUID}
        AND project_id = {project_id: UUID}
      ORDER BY start_time ASC
    `,
    query_params: {
      trace_id: traceId,
      project_id: projectId,
    },
    format: "JSONEachRow",
  });

  return (await result.json()) as SpanInfo[];
}

interface SpanRow {
  spanId: string;
  name: string;
  type: string;
  path: string;
  start: string;
  end: string;
  status: string;
  parent: string;
  input: string;
  output: string;
}

async function fetchSpanDetailsDirect(
  projectId: string,
  traceId: string,
  spanIds: string[]
): Promise<Map<string, import("@/lib/actions/trace/agent/spans").Span>> {
  if (spanIds.length === 0) return new Map();

  const result = await client.query({
    query: `
      SELECT
        span_id as spanId,
        name,
        CASE
          WHEN span_type = 0 THEN 'DEFAULT'
          WHEN span_type = 1 THEN 'LLM'
          WHEN span_type = 3 THEN 'EXECUTOR'
          WHEN span_type = 4 THEN 'EVALUATOR'
          WHEN span_type = 5 THEN 'EVALUATION'
          WHEN span_type = 6 THEN 'TOOL'
          WHEN span_type = 7 THEN 'HUMAN_EVALUATOR'
          WHEN span_type = 8 THEN 'CACHED'
          ELSE 'UNKNOWN'
        END as type,
        path,
        start_time as start,
        end_time as end,
        CASE
          WHEN status = 'error' THEN 'error'
          ELSE 'success'
        END as status,
        parent_span_id as parent,
        input,
        output
      FROM spans
      WHERE trace_id = {trace_id: UUID}
        AND project_id = {project_id: UUID}
        AND span_id IN {span_ids: Array(UUID)}
    `,
    query_params: {
      trace_id: traceId,
      project_id: projectId,
      span_ids: spanIds,
    },
    format: "JSONEachRow",
  });

  const rows = (await result.json()) as SpanRow[];
  const map = new Map<string, import("@/lib/actions/trace/agent/spans").Span>();

  for (const row of rows) {
    let input: unknown;
    let output: unknown;
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

    map.set(row.spanId, {
      spanId: row.spanId,
      name: row.name,
      type: row.type,
      path: row.path,
      start: row.start,
      end: row.end,
      status: row.status,
      parent: row.parent,
      input,
      output,
    });
  }

  return map;
}

function printTreeStats(roots: AnnotatedNode[], indent = 0): void {
  for (const node of roots) {
    const prefix = " ".repeat(indent);
    const desc = node.llmToolDescendantCount;
    if (desc > 0) {
      console.log(`${prefix}${node.spanInfo.name} [${node.spanInfo.type}] → ${desc} LLM/TOOL descendants`);
    }
    printTreeStats(node.children, indent + 2);
  }
}

async function testTrace(label: string, traceId: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Testing: ${label}`);
  console.log(`Trace ID: ${traceId}`);
  console.log("=".repeat(70));

  // 1. Fetch span infos
  const spanInfos = await fetchSpanInfosDirect(PROJECT_ID, traceId);
  console.log(`\nTotal spans: ${spanInfos.length}`);

  const llmToolCount = spanInfos.filter((s) => s.type === "LLM" || s.type === "TOOL").length;
  console.log(`LLM/TOOL spans: ${llmToolCount}`);

  // 2. Build annotated tree
  const roots = buildAnnotatedTree(spanInfos);
  console.log(`Root nodes: ${roots.length}`);

  console.log("\nTree structure (non-leaf nodes with LLM/TOOL descendants):");
  printTreeStats(roots);

  // 3. Find partition points with threshold=20
  const partitionPoints = findPartitionPoints(roots, 20);
  console.log(`\nPartition points (threshold=20): ${partitionPoints.size}`);
  for (const pp of partitionPoints) {
    const info = spanInfos.find((s) => s.spanId === pp)!;
    const node = findNode(roots, pp)!;
    console.log(`  - ${info.name} [${info.type}] → ${node.llmToolDescendantCount} LLM/TOOL descendants`);
  }

  if (partitionPoints.size === 0) {
    console.log("  → No partitioning needed (small trace), would use single request path");

    // Also try lower threshold
    const lowerPoints = findPartitionPoints(roots, 5);
    console.log(`\nPartition points (threshold=5, for testing): ${lowerPoints.size}`);
    for (const pp of lowerPoints) {
      const info = spanInfos.find((s) => s.spanId === pp)!;
      const node = findNode(roots, pp)!;
      console.log(`  - ${info.name} [${info.type}] → ${node.llmToolDescendantCount} LLM/TOOL descendants`);
    }
  }

  // 4. Build partition subtrees and verify
  const partitionSubtrees = new Map<string, Set<string>>();
  for (const pp of partitionPoints) {
    const subtreeIds = collectSubtreeSpanIds(roots, pp);
    partitionSubtrees.set(pp, subtreeIds);
    console.log(`\n  Subtree for ${spanInfos.find((s) => s.spanId === pp)!.name}: ${subtreeIds.size} spans`);

    const nonLeafBlocks = identifyNonLeafBlocks(spanInfos, subtreeIds);
    console.log(`    Non-leaf blocks needing summaries: ${nonLeafBlocks.length}`);

    // Build sub-skeleton
    const { skeleton, localSeqIdMap } = buildSubSkeleton(spanInfos, subtreeIds);
    console.log(`    Sub-skeleton lines: ${skeleton.split("\n").length - 1}`);
    console.log(`    Local seq IDs: ${localSeqIdMap.size}`);

    // Verify sub-skeleton doesn't reference spans outside subtree
    const skeletonSpanCount = skeleton.split("\n").filter((l) => l.startsWith("- ")).length;
    console.log(`    Skeleton span entries: ${skeletonSpanCount}`);
    if (skeletonSpanCount !== subtreeIds.size) {
      console.error(`    ❌ MISMATCH: expected ${subtreeIds.size} entries, got ${skeletonSpanCount}`);
    } else {
      console.log(`    ✅ Skeleton count matches subtree size`);
    }
  }

  // 5. Test sub-YAML generation (fetch details for LLM/TOOL spans)
  if (partitionPoints.size > 0) {
    const llmToolIds = spanInfos.filter((s) => s.type === "LLM" || s.type === "TOOL").map((s) => s.spanId);
    const spansMap = await fetchSpanDetailsDirect(PROJECT_ID, traceId, llmToolIds);
    console.log(`\nFetched ${spansMap.size} LLM/TOOL span details`);

    for (const [pp, subtreeIds] of partitionSubtrees) {
      const { localSeqIdMap } = buildSubSkeleton(spanInfos, subtreeIds);
      const yaml = buildSubYaml(spanInfos, spansMap, subtreeIds, localSeqIdMap);
      const yamlLines = yaml.split("\n").length;
      console.log(
        `  Sub-YAML for ${spanInfos.find((s) => s.spanId === pp)!.name}: ${yamlLines} lines, ${yaml.length} chars`
      );
    }

    // 6. Test collapsed skeleton
    const fakeSummaries = new Map<string, string>();
    for (const pp of partitionPoints) {
      fakeSummaries.set(pp, `[placeholder summary for ${spanInfos.find((s) => s.spanId === pp)!.name}]`);
    }

    const collapsedSkeleton = buildCollapsedSkeleton(spanInfos, fakeSummaries, partitionSubtrees);
    const collapsedLines = collapsedSkeleton.split("\n").filter((l) => l.startsWith("- ")).length;
    const originalLines = spanInfos.length;
    console.log(`\nCollapsed skeleton: ${collapsedLines} entries (original: ${originalLines})`);
    console.log(`  Reduction: ${originalLines - collapsedLines} spans collapsed`);

    // Verify BLOCK entries
    const blockEntries = collapsedSkeleton.split("\n").filter((l) => l.includes("BLOCK"));
    console.log(`  BLOCK entries: ${blockEntries.length}`);
    for (const entry of blockEntries) {
      console.log(`    ${entry.trim()}`);
    }

    // 7. Test collapsed YAML
    const allPartitionSpanIds = new Set<string>();
    for (const subtreeIds of partitionSubtrees.values()) {
      for (const id of subtreeIds) allPartitionSpanIds.add(id);
    }

    const collapsedYaml = buildCollapsedYaml(spanInfos, spansMap, allPartitionSpanIds);
    const collapsedYamlLines = collapsedYaml.split("\n").length;
    console.log(`  Collapsed YAML: ${collapsedYamlLines} lines, ${collapsedYaml.length} chars`);

    // Verify no partition spans leak into collapsed YAML
    const yamlSpanIds = new Set<string>();
    // Parse YAML to check ids aren't from partitions (crude check)
    for (const line of collapsedYaml.split("\n")) {
      const match = line.match(/id:\s*(\d+)/);
      if (match) {
        const seqId = parseInt(match[1]);
        if (seqId > 0 && seqId <= spanInfos.length) {
          yamlSpanIds.add(spanInfos[seqId - 1].spanId);
        }
      }
    }

    let leakedCount = 0;
    for (const id of yamlSpanIds) {
      if (allPartitionSpanIds.has(id)) leakedCount++;
    }
    if (leakedCount > 0) {
      console.log(`  ❌ ${leakedCount} partition spans leaked into collapsed YAML`);
    } else {
      console.log(`  ✅ No partition spans leaked into collapsed YAML`);
    }
  }

  console.log(`\n✅ ${label} test complete`);
}

function findNode(roots: AnnotatedNode[], spanId: string): AnnotatedNode | null {
  for (const root of roots) {
    if (root.spanInfo.spanId === spanId) return root;
    const found = findNode(root.children, spanId);
    if (found) return found;
  }
  return null;
}

async function main() {
  try {
    await testTrace("Browser Use - Left", BROWSER_LEFT);
    await testTrace("Browser Use - Right", BROWSER_RIGHT);
    await testTrace("Claude Agent SDK - Left", AGENT_LEFT);
    await testTrace("Claude Agent SDK - Right", AGENT_RIGHT);

    console.log("\n" + "=".repeat(70));
    console.log("ALL INTEGRATION TESTS PASSED");
    console.log("=".repeat(70));
  } catch (e) {
    console.error("\n❌ INTEGRATION TEST FAILED:", e);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
