import { google } from "@ai-sdk/google";
import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { BLOCK_SUMMARY_SYSTEM_PROMPT } from "@/lib/actions/trace/summarize/summarize-prompt";

const BlockSummaryResultSchema = z.object({
  results: z.array(
    z.object({
      blockId: z.string(),
      summary: z.string(),
      icon: z.string(),
    })
  ),
});

export async function POST(req: Request) {
  const { traceString, blocks } = await req.json();

  if (!blocks || blocks.length === 0) {
    return Response.json([]);
  }

  const blockDescriptions = blocks
    .map(
      (b: {
        blockId: string;
        spanName: string;
        spanType: string;
        descendantNames: string[];
        descendantTypes: string[];
      }) =>
        `Block ${b.blockId}: name="${b.spanName}", type=${b.spanType}, descendants=[${b.descendantNames.map((n: string, i: number) => `${n}(${b.descendantTypes[i]})`).join(", ")}]`
    )
    .join("\n");

  const prompt = `<trace_context>
${traceString}
</trace_context>

Label these blocks:
${blockDescriptions}

Respond with ONLY a JSON object in this exact format, no other text:
{"results": [{"blockId": "<id>", "summary": "<2-7 word label>", "icon": "<icon name>"}]}`;

  const t0 = performance.now();

  try {
    const { object } = await observe({ name: "generateBlockSummaries" }, async () =>
      generateObject({
        model: google("gemini-3.1-flash-lite-preview"),
        schema: BlockSummaryResultSchema,
        system: BLOCK_SUMMARY_SYSTEM_PROMPT,
        prompt,
        experimental_telemetry: {
          isEnabled: true,
          tracer: getTracer(),
        },
      })
    );

    console.log(`[SUMMARIZE] blocks=${blocks.length} duration=${(performance.now() - t0).toFixed(0)}ms`);
    return Response.json(object.results);
  } catch (error) {
    console.error("generateBlockSummaries failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate block summaries" },
      { status: 500 }
    );
  }
}
