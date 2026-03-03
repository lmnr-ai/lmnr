"use server";

import { google } from "@ai-sdk/google";
import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { fetchSpanInfos, getTraceStructureAsString } from "@/lib/actions/trace/agent/spans";
import { type SpanMapping } from "@/lib/traces/types";

import { SPAN_MATCHING_SYSTEM_PROMPT } from "./prompts";

const SpanMatchSchema = z.object({
  mappings: z.array(
    z.object({
      spanA: z.number().describe("Sequential ID (1-indexed) of the span in Trace A"),
      spanB: z.number().describe("Sequential ID (1-indexed) of the span in Trace B"),
      description: z.string().optional().describe("Brief explanation of why these spans match"),
    })
  ),
});

export const generateSpanMapping = async (
  projectId: string,
  leftTraceId: string,
  rightTraceId: string
): Promise<SpanMapping> => {
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
        system: SPAN_MATCHING_SYSTEM_PROMPT,
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
};
