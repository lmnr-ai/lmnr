"use server";

import { getTraceStructureAsString, type TraceStructureResult } from "@/lib/actions/trace/agent/spans";

/**
 * Fetch trace context from ClickHouse and build the skeleton + YAML string.
 * Pure data fetch, no LLM calls. Reusable for any trace feature.
 */
export const buildTraceContext = async (
  projectId: string,
  traceId: string,
  opts?: { excludeDefault?: boolean }
): Promise<TraceStructureResult> => {
  const t0 = performance.now();
  console.log(`[DIFF-TIMING] buildTraceContext START traceId=${traceId.slice(0, 8)} t=${new Date().toISOString()}`);
  const result = await getTraceStructureAsString(projectId, traceId, opts);
  console.log(
    `[DIFF-TIMING] buildTraceContext END   traceId=${traceId.slice(0, 8)} duration=${(performance.now() - t0).toFixed(0)}ms`
  );
  return result;
};
