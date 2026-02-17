import { type NextRequest } from "next/server";
import { prettifyError, z, ZodError } from "zod/v4";

import { generateSql } from "@/lib/actions/sql";

const GenerateSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  mode: z.enum(["query", "eval-expression"]).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    await params;
    const body = await request.json();
    const { prompt, mode } = GenerateSchema.parse(body);

    const result = await generateSql(prompt, mode);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ query: result.result });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate query." },
      { status: 500 }
    );
  }
}
