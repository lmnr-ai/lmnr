"use server";

import { google } from "@ai-sdk/google";
import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { getTraceStructureAsString } from "@/lib/actions/trace/agent/spans";

import { BLOCK_SUMMARY_SYSTEM_PROMPT } from "./summarize-prompt";

const BlockSummaryResultSchema = z.object({
  results: z.array(
    z.object({
      blockId: z.string().describe("The block ID from the input"),
      summary: z.string().describe("A 2-7 word unique summary of what this block does"),
      icon: z.string().describe("Icon name from the available set that best represents this block"),
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
  projectId: string,
  traceId: string,
  blocks: BlockSummaryInput[]
): Promise<BlockSummaryResult[]> {
  if (blocks.length === 0) return [];

  const { traceString } = await getTraceStructureAsString(projectId, traceId);

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
${blockDescriptions}`;

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

  return object.results;
}
