import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject, type ModelMessage } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";

import { getTemplateGenerationPrompts } from "./prompts";

const GenerationResultSchema = z.object({
  success: z.boolean().describe("Whether the template generation was successful"),
  result: z.string().optional().describe("The generated JSX template function (when success is true)"),
  summary: z
    .string()
    .optional()
    .describe(
      'A short (5-12 words) one-line summary of what you just built or changed, written for the user. Examples: "Added a status badge", "Initial status card with latency and cost". Required when success is true.'
    ),
  error: z.string().optional().describe("Brief explanation of why the request was refused (when success is false)"),
});

export type TemplateGenerationResult =
  | { success: true; result: string; summary: string }
  | { success: false; error: string };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function generateRenderTemplate(
  prompt: string,
  history: ChatTurn[],
  currentCode?: string,
  testData?: string
): Promise<TemplateGenerationResult> {
  const prompts = getTemplateGenerationPrompts(currentCode, testData);

  const messages: ModelMessage[] = [
    ...history.map<ModelMessage>((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: prompt },
  ];

  const { object } = await observe(
    { name: "generateRenderTemplate" },
    async () =>
      await generateObject({
        model: getLanguageModel("default"),
        schema: GenerationResultSchema,
        system: prompts.system,
        messages,
        experimental_telemetry: {
          isEnabled: true,
          tracer: getTracer(),
        },
      })
  );

  if (object.success && object.result) {
    return {
      success: true,
      result: object.result,
      summary: object.summary?.trim() || "Updated the template",
    };
  }

  return { success: false, error: object.error || "Failed to generate template" };
}
