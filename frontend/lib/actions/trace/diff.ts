"use server";

import { google } from "@ai-sdk/google";
import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { type SpanMapping } from "@/components/traces/trace-diff/trace-diff-types";
import { fetchSpanInfos, getTraceStructureAsString } from "@/lib/actions/trace/agent/spans";

const SpanMatchSchema = z.object({
  mappings: z.array(
    z.object({
      spanA: z.number().describe("Sequential ID (1-indexed) of the span in Trace A"),
      spanB: z.number().describe("Sequential ID (1-indexed) of the span in Trace B"),
      description: z.string().optional().describe("Brief explanation of why these spans match"),
    })
  ),
});

const SYSTEM_PROMPT = `You are an expert at analyzing LLM application execution traces. Your task is to match corresponding spans between two traces of the same or similar application.

Each trace is presented with:
1. A skeleton view showing all spans with their sequential IDs, names, parent relationships, and types
2. Detailed views of LLM and TOOL spans with their inputs and outputs

Match spans that represent the same logical step or operation. Consider:
- Span names and paths (strongest signal)
- Span types (LLM, TOOL, DEFAULT)
- Position in the call hierarchy (parent-child relationships)
- Input/output similarity for detailed spans

Rules:
- Not every span needs a match — some spans may exist in only one trace
- Each span can appear in at most one mapping
- Use the sequential span IDs (1-indexed) shown in the skeleton views
- Only match spans that clearly correspond to the same logical operation
- Return the mappings in a very specific order such that we maintain the invariant that every span on either side appears in order of their respective timestamp`;

export async function generateSpanMapping(
  projectId: string,
  leftTraceId: string,
  rightTraceId: string
): Promise<SpanMapping> {
  const [leftStructure, rightStructure, leftSpanInfos, rightSpanInfos] = await Promise.all([
    getTraceStructureAsString(projectId, leftTraceId),
    getTraceStructureAsString(projectId, rightTraceId),
    fetchSpanInfos(projectId, leftTraceId),
    fetchSpanInfos(projectId, rightTraceId),
  ]);

  const { object } = await observe(
    { name: "generateSpanMapping" },
    async () =>
      await generateObject({
        model: google("gemini-3-flash-preview"),
        schema: SpanMatchSchema,
        system: SYSTEM_PROMPT,
        prompt: `Here is Trace A (left):
<trace_a>
${leftStructure.traceString}
</trace_a>

Here is Trace B (right):
<trace_b>
${rightStructure.traceString}
</trace_b>`,
        experimental_telemetry: {
          isEnabled: true,
          tracer: getTracer(),
        },
      })
  );

  // Resolve 1-indexed sequential IDs to span UUIDs
  const mapping: SpanMapping = [];
  for (const { spanA, spanB } of object.mappings) {
    const leftIdx = spanA - 1;
    const rightIdx = spanB - 1;

    if (leftIdx >= 0 && leftIdx < leftSpanInfos.length && rightIdx >= 0 && rightIdx < rightSpanInfos.length) {
      mapping.push([leftSpanInfos[leftIdx].spanId, rightSpanInfos[rightIdx].spanId]);
    }
  }

  return mapping;
}
