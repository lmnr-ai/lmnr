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
- Return the mappings in a very specific order such that we maintain the invariant that every span on either side appears in order of their respective timestamp

There may be situations like this.
Consider a trace of LLM-A-1, TOOL-B-1, LLM-C-1
Compared against a trace of TOOL-B-2, LLM-A-2, LLM-C-2

Here we would ideally map A->A, B->B, C->C, but that would result in breaking our invariant.

The two possible outcomes would be:
(null, TOOL-B-2)
(LLM-A-1, LLM-A-2)
(TOOL-B-1, null)
(LLM-C-1, LLM-C-2)

(LLM-A-1, null)
(TOOL-B-1, TOOL-B-2)
(null, LLM-B-2)
(LLM-C-1, LLM-C-2)

These two both satisfy the invariant but in situations like this I would like you to prioritize matching the tool calls. The matches that MUST be prioritized are TOOL CALLS OF THE SAME TYPE WITH SIMILAR INTENT. 

`;

export async function generateSpanMapping(
  projectId: string,
  leftTraceId: string,
  rightTraceId: string
): Promise<SpanMapping> {
  const [leftStructure, rightStructure, allLeftSpanInfos, allRightSpanInfos] = await Promise.all([
    getTraceStructureAsString(projectId, leftTraceId, { excludeDefault: true }),
    getTraceStructureAsString(projectId, rightTraceId, { excludeDefault: true }),
    fetchSpanInfos(projectId, leftTraceId),
    fetchSpanInfos(projectId, rightTraceId),
  ]);

  const leftSpanInfos = allLeftSpanInfos.filter((s) => s.type !== "DEFAULT");
  const rightSpanInfos = allRightSpanInfos.filter((s) => s.type !== "DEFAULT");

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
