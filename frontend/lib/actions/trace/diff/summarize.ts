"use server";

import { google } from "@ai-sdk/google";
import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { BLOCK_SUMMARY_SYSTEM_PROMPT } from "./summarize-prompt";

const BlockSummaryResultSchema = z.object({
  results: z.array(
    z.object({
      blockId: z.string(),
      summary: z.string(),
      icon: z.string(),
    })
  ),
});

export interface BlockSummaryInput {
  blockId: string;
  spanName: string;
  spanType: string;
  descendantNames: string[];
  descendantTypes: string[];
}

export type BlockSummaryResult = z.infer<typeof BlockSummaryResultSchema>["results"][number];

export async function generateBlockSummaries(
  traceString: string,
  blocks: BlockSummaryInput[]
): Promise<BlockSummaryResult[]> {
  if (blocks.length === 0) return [];

  const blockDescriptions = blocks
    .map(
      (b) =>
        `Block ${b.blockId}: name="${b.spanName}", type=${b.spanType}, descendants=[${b.descendantNames.map((n, i) => `${n}(${b.descendantTypes[i]})`).join(", ")}]`
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
  console.log(`[DIFF-TIMING] generateBlockSummaries START blocks=${blocks.length} t=${new Date().toISOString()}`);
  try {
    const { object } = await observe({ name: "generateBlockSummaries" }, async () =>
      generateObject({
        model: google("gemini-3-flash-preview"),
        schema: BlockSummaryResultSchema,
        system: BLOCK_SUMMARY_SYSTEM_PROMPT,
        prompt,
        experimental_telemetry: {
          isEnabled: true,
          tracer: getTracer(),
        },
      })
    );

    console.log(
      `[DIFF-TIMING] generateBlockSummaries END   blocks=${blocks.length} duration=${(performance.now() - t0).toFixed(0)}ms`
    );
    return object.results;
  } catch (e: unknown) {
    console.error("generateBlockSummaries failed:", e);
    throw e;
  }
}
