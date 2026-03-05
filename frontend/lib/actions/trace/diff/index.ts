"use server";

import { google } from "@ai-sdk/google";
import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { getTraceStructureAsString } from "@/lib/actions/trace/agent/spans";
import { type SpanMapping } from "@/lib/traces/types";

import { SPAN_MATCHING_SYSTEM_PROMPT } from "./prompts";

const SpanMatchSchema = z.object({
  mappings: z.array(
    z.object({
      spanA: z.number(),
      spanB: z.number(),
      description: z.string().optional(),
    })
  ),
});

export interface SpanMappingResult {
  mapping: SpanMapping;
  leftTraceString: string;
  rightTraceString: string;
}

export const generateSpanMapping = async (
  projectId: string,
  leftTraceId: string,
  rightTraceId: string
): Promise<SpanMappingResult> => {
  const [leftStructure, rightStructure] = await Promise.all([
    getTraceStructureAsString(projectId, leftTraceId, { excludeDefault: true }),
    getTraceStructureAsString(projectId, rightTraceId, { excludeDefault: true }),
  ]);

  const leftSpanInfos = leftStructure.spanInfos;
  const rightSpanInfos = rightStructure.spanInfos;

  let mappings: { spanA: number; spanB: number }[] = [];
  try {
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

    mappings = object.mappings;
  } catch (e: unknown) {
    console.error("generateSpanMapping failed:", e);
    throw e;
  }

  // Resolve 1-indexed sequential IDs to span UUIDs
  const mapping: SpanMapping = [];
  for (const { spanA, spanB } of mappings) {
    const leftIdx = spanA - 1;
    const rightIdx = spanB - 1;

    if (leftIdx >= 0 && leftIdx < leftSpanInfos.length && rightIdx >= 0 && rightIdx < rightSpanInfos.length) {
      mapping.push([leftSpanInfos[leftIdx].spanId, rightSpanInfos[rightIdx].spanId]);
    }
  }

  return {
    mapping,
    leftTraceString: leftStructure.traceString,
    rightTraceString: rightStructure.traceString,
  };
};
