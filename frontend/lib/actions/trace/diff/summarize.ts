"use server";

import { google } from "@ai-sdk/google";
import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { ICON_DESCRIPTIONS } from "@/components/traces/trace-diff/timeline/timeline-icons";

const BlockSummaryResultSchema = z.object({
  results: z.array(
    z.object({
      blockId: z.string().describe("The block ID from the input"),
      summary: z.string().describe("A 2-3 word summary of what this block does"),
      icon: z.string().describe("Icon name from the available set that best represents this block"),
    })
  ),
});

export interface BlockSummaryInput {
  blockId: string;
  spanName: string;
  spanType: string;
  childNames: string[];
  childTypes: string[];
}

export type BlockSummaryResult = z.infer<typeof BlockSummaryResultSchema>["results"][number];

const SYSTEM_PROMPT = `You are a trace analysis assistant. Given a list of span blocks from an AI agent trace, generate a concise 2-3 word summary and pick the best icon for each block.

Each block has:
- blockId: unique identifier
- spanName: the name of the root span in the block
- spanType: the type (LLM, TOOL, DEFAULT, EXECUTOR, etc.)
- childNames: names of direct child spans
- childTypes: types of direct child spans

For each block, return:
- summary: A 2-3 word description of what the block does (e.g., "Plan response", "Search docs", "Generate code")
- icon: The best matching icon name from the set below

${ICON_DESCRIPTIONS}

Keep summaries action-oriented and concise. Use title case.`;

export async function generateBlockSummaries(blocks: BlockSummaryInput[]): Promise<BlockSummaryResult[]> {
  if (blocks.length === 0) return [];

  const prompt = blocks
    .map(
      (b) =>
        `Block ${b.blockId}: name="${b.spanName}", type=${b.spanType}, children=[${b.childNames.map((n, i) => `${n}(${b.childTypes[i]})`).join(", ")}]`
    )
    .join("\n");

  const { object } = await observe({ name: "generateBlockSummaries" }, async () =>
    generateObject({
      model: google("gemini-3-flash-preview"),
      schema: BlockSummaryResultSchema,
      system: SYSTEM_PROMPT,
      prompt,
      experimental_telemetry: {
        isEnabled: true,
        tracer: getTracer(),
      },
    })
  );

  return object.results;
}
