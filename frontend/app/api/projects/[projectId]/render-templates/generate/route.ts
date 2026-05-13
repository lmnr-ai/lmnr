import { type NextRequest } from "next/server";
import { prettifyError, z, ZodError } from "zod/v4";

import { generateRenderTemplate } from "@/lib/actions/render-template/generate";

const GenerateSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .max(40)
    .optional(),
  currentCode: z.string().optional(),
  testData: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    await params;
    const body = await request.json();
    const { prompt, history, currentCode, testData } = GenerateSchema.parse(body);

    const result = await generateRenderTemplate(prompt, history ?? [], currentCode, testData);
    if (!result.success) {
      return Response.json({ success: false, error: result.error }, { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate template." },
      { status: 500 }
    );
  }
}
