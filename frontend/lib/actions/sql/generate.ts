import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

import { getGenerationPrompts } from "./prompts";
import type { GenerationMode, GenerationResult } from "./types";

const GenerationResultSchema = z.object({
  success: z.boolean().describe("Whether the SQL generation was successful"),
  result: z.string().optional().describe("The generated SQL query or expression (when success is true)"),
  error: z.string().optional().describe("Brief explanation of why the request was refused (when success is false)"),
});

export async function generateSql(prompt: string, mode?: GenerationMode): Promise<GenerationResult> {
  const prompts = getGenerationPrompts(mode);

  const { object } = await generateObject({
    model: google("gemini-2.0-flash"),
    schema: GenerationResultSchema,
    system: prompts.system,
    prompt: prompts.user(prompt),
  });

  if (object.success && object.result) {
    return { success: true, result: object.result };
  }

  return { success: false, error: object.error || "Failed to generate SQL" };
}
