import { observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";

import { getGenerationPrompts } from "./prompts";
import type { GenerationResult } from "./types";

const GenerationResultSchema = z.object({
  success: z.boolean().describe("Whether the SQL generation was successful"),
  result: z.string().optional().describe("The generated SQL query or expression (when success is true)"),
  error: z.string().optional().describe("Brief explanation of why the request was refused (when success is false)"),
});

const GenerateSchema = z.object({
  projectId: z.guid(),
  prompt: z.string().min(1, "Prompt is required"),
  mode: z.enum(["query", "eval-expression", "trace-expression"]).optional(),
  currentQuery: z.string().optional(),
});

export async function generateSql(input: z.infer<typeof GenerateSchema>): Promise<GenerationResult> {
  const { projectId, prompt, mode, currentQuery } = GenerateSchema.parse(input);
  const prompts = getGenerationPrompts(mode, currentQuery);

  const { object } = await observe(
    { name: "generateSql", input: { projectId, mode } },
    async () =>
      await generateObject({
        model: getLanguageModel("medium"),
        schema: GenerationResultSchema,
        system: prompts.system,
        prompt: prompts.user(prompt),
        experimental_telemetry: { isEnabled: true },
      })
  );

  if (object.success && object.result) {
    return { success: true, result: object.result };
  }

  return { success: false, error: object.error || "Failed to generate SQL" };
}
