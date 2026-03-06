import { google } from "@ai-sdk/google";
import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { SPAN_MATCHING_SYSTEM_PROMPT } from "@/lib/actions/trace/diff/prompts";
import { type SpanMapping } from "@/lib/traces/types";

const SpanMatchSchema = z.object({
  mappings: z.array(
    z.object({
      spanA: z.number(),
      spanB: z.number(),
      description: z.string().optional(),
    })
  ),
});

export async function POST(req: Request) {
  const { leftTraceString, rightTraceString, leftSpanIds, rightSpanIds } = await req.json();

  const t0 = performance.now();
  console.log(`[DIFF-TIMING] generateSpanMapping START t=${new Date().toISOString()}`);

  try {
    const { object } = await observe(
      { name: "generateSpanMapping" },
      async () =>
        await generateObject({
          model: google("gemini-3.1-flash-lite-preview"),
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

    // Resolve 1-indexed sequential IDs to span UUIDs
    const mapping: SpanMapping = [];
    for (const { spanA, spanB } of object.mappings) {
      const leftIdx = spanA - 1;
      const rightIdx = spanB - 1;
      if (leftIdx >= 0 && leftIdx < leftSpanIds.length && rightIdx >= 0 && rightIdx < rightSpanIds.length) {
        mapping.push([leftSpanIds[leftIdx], rightSpanIds[rightIdx]]);
      }
    }

    console.log(
      `[DIFF-TIMING] generateSpanMapping END   duration=${(performance.now() - t0).toFixed(0)}ms mappings=${mapping.length}`
    );
    return Response.json({ mapping });
  } catch (error) {
    console.error("generateSpanMapping failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate span mapping" },
      { status: 500 }
    );
  }
}
