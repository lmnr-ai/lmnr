"use server";

import { google } from "@ai-sdk/google";
import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

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
}

/**
 * Pure LLM call: match spans between two traces.
 * Takes pre-built trace context strings and spanInfos for ID resolution.
 */
export const generateSpanMapping = async (
  leftTraceString: string,
  rightTraceString: string,
  leftSpanIds: string[],
  rightSpanIds: string[]
): Promise<SpanMappingResult> => {
  const t0 = performance.now();
  console.log(`[DIFF-TIMING] generateSpanMapping START t=${new Date().toISOString()}`);
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
${leftTraceString}
</trace_a>

Here is Trace B (right):
<trace_b>
${rightTraceString}
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

    if (leftIdx >= 0 && leftIdx < leftSpanIds.length && rightIdx >= 0 && rightIdx < rightSpanIds.length) {
      mapping.push([leftSpanIds[leftIdx], rightSpanIds[rightIdx]]);
    }
  }

  console.log(
    `[DIFF-TIMING] generateSpanMapping END   duration=${(performance.now() - t0).toFixed(0)}ms mappings=${mapping.length}`
  );
  return { mapping };
};
