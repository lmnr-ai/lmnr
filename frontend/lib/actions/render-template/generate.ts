import { observe } from "@lmnr-ai/lmnr";
import { generateText, Output } from "ai";
import { z } from "zod";

import { getTraceSpanOutline } from "@/lib/actions/trace/span-outline";
import { getLanguageModel } from "@/lib/ai/model";

import { buildSpanTemplateSystemPrompt, buildTraceTemplateSystemPrompt } from "./prompts";

const GenerationResultSchema = z.object({
  success: z.boolean().describe("Whether the template generation was successful"),
  code: z
    .string()
    .optional()
    .describe("The complete JSX template function source, no markdown fences (when success is true)"),
  whereClause: z
    .string()
    .optional()
    .describe(
      "Trace scope only: the full SQL WHERE fragment selecting the spans to render; empty string renders all spans"
    ),
  error: z.string().optional().describe("Brief explanation of why the request was refused (when success is false)"),
});

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const GenerateSchema = z.object({
  projectId: z.guid(),
  scope: z.enum(["span", "trace"]),
  // Full dialog-session history; the last entry is the current user request.
  messages: z.array(MessageSchema).min(1),
  currentCode: z.string().optional(),
  currentWhereClause: z.string().nullish(),
  testData: z.string().optional(),
  traceId: z.guid().optional(),
});

export type GenerateRenderTemplateInput = z.infer<typeof GenerateSchema>;

export type RenderTemplateGenerationResult =
  | { success: true; code: string; whereClause?: string }
  | { success: false; error: string };

export async function generateRenderTemplate(
  input: GenerateRenderTemplateInput
): Promise<RenderTemplateGenerationResult> {
  const { projectId, scope, messages, currentCode, currentWhereClause, testData, traceId } =
    GenerateSchema.parse(input);

  let system: string;
  if (scope === "trace") {
    let outline: string | undefined;
    if (traceId) {
      try {
        outline = JSON.stringify(await getTraceSpanOutline({ projectId, traceId }), null, 2);
      } catch {
        // Outline is an enrichment — generate without it rather than failing the request.
      }
    }
    system = buildTraceTemplateSystemPrompt(outline, currentCode, currentWhereClause);
  } else {
    system = buildSpanTemplateSystemPrompt(testData, currentCode);
  }

  const { output } = await observe(
    { name: "generateRenderTemplate", input: { projectId, scope } },
    async () =>
      await generateText({
        model: getLanguageModel("large"),
        output: Output.object({ schema: GenerationResultSchema }),
        system,
        messages,
      })
  );

  if (output.success && output.code) {
    return {
      success: true,
      code: output.code,
      ...(scope === "trace" && { whereClause: output.whereClause ?? "" }),
    };
  }

  return { success: false, error: output.error || "Failed to generate the template" };
}
