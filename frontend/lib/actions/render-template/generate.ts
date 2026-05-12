import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateObject } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/model";

import { getTemplateGenerationPrompts } from "./prompts";

const GenerationResultSchema = z.object({
  success: z.boolean().describe("Whether the template generation was successful"),
  result: z.string().optional().describe("The generated JSX template function (when success is true)"),
  error: z.string().optional().describe("Brief explanation of why the request was refused (when success is false)"),
});

export type TemplateGenerationResult = { success: true; result: string } | { success: false; error: string };

export async function generateRenderTemplate(
  prompt: string,
  currentCode?: string,
  testData?: string
): Promise<TemplateGenerationResult> {
  const prompts = getTemplateGenerationPrompts(currentCode, testData);

  const { object } = await observe(
    { name: "generateRenderTemplate" },
    async () =>
      await generateObject({
        model: getLanguageModel("default"),
        schema: GenerationResultSchema,
        system: prompts.system,
        prompt: prompts.user(prompt),
        experimental_telemetry: {
          isEnabled: true,
          tracer: getTracer(),
        },
      })
  );

  if (object.success && object.result) {
    return { success: true, result: object.result };
  }

  return { success: false, error: object.error || "Failed to generate template" };
}
