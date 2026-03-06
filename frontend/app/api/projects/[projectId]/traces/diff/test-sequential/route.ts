import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

import { getTraceStructureAsString } from "@/lib/actions/trace/agent/spans";
import { SPAN_MATCHING_SYSTEM_PROMPT } from "@/lib/actions/trace/diff/prompts";

const SpanMatchSchema = z.object({
  mappings: z.array(z.object({ spanA: z.number(), spanB: z.number(), description: z.string().optional() })),
});

// Test route: runs mapping ALONE (no parallel calls) to measure single-call latency
export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  const { leftTraceId, rightTraceId } = await req.json();

  const timings: Record<string, number> = {};

  // Build context
  const t0 = performance.now();
  const [leftCtx, rightCtx] = await Promise.all([
    getTraceStructureAsString(projectId, leftTraceId, { excludeDefault: true }),
    getTraceStructureAsString(projectId, rightTraceId, { excludeDefault: true }),
  ]);
  timings.buildContext = performance.now() - t0;

  // Single mapping call — no other concurrent LLM calls
  const t1 = performance.now();
  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: SpanMatchSchema,
    system: SPAN_MATCHING_SYSTEM_PROMPT,
    prompt: `Here is Trace A (left):\n<trace_a>\n${leftCtx.traceString}\n</trace_a>\n\nHere is Trace B (right):\n<trace_b>\n${rightCtx.traceString}\n</trace_b>`,
  });
  timings.mapping = performance.now() - t1;
  timings.total = performance.now() - t0;

  console.log(
    `[SEQ-TEST] context=${timings.buildContext.toFixed(0)}ms mapping=${timings.mapping.toFixed(0)}ms total=${timings.total.toFixed(0)}ms mappings=${object.mappings.length}`
  );

  return Response.json({ timings, mappingCount: object.mappings.length });
}
