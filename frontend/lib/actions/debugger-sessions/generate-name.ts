import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

const MAX_PROMPT_CHARS = 500;

const NameResultSchema = z.object({
  success: z.boolean().describe("Whether a descriptive name could be generated from the prompt"),
  name: z.string().optional().describe("A short 2-5 word descriptive name for the agent/role (when success is true)"),
  error: z
    .string()
    .optional()
    .describe("Brief explanation of why a name could not be generated (when success is false)"),
});

export type GenerateNameResult = { success: true; name: string } | { success: false; error: string };

export async function generatePromptName(promptContent: string): Promise<GenerateNameResult> {
  const truncated = promptContent.slice(0, MAX_PROMPT_CHARS);

  const { object } = await generateObject({
    model: google("gemini-2.5-flash-lite"),
    schema: NameResultSchema,
    prompt: `Given this system prompt, generate a short 2-5 word descriptive name for the agent/role it defines. If the input is not a valid system prompt or is too vague to name, set success to false with a brief error.\n\nSystem prompt:\n${truncated}`,
  });

  if (object.success && object.name) {
    return { success: true, name: object.name };
  }

  return { success: false, error: object.error || "Failed to generate name" };
}
