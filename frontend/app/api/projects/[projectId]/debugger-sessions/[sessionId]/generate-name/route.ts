import { NextResponse } from "next/server";
import { prettifyError, z, ZodError } from "zod/v4";

import { generatePromptName } from "@/lib/actions/debugger-sessions/generate-name";

const GenerateNameSchema = z.object({
  promptContent: z.string().min(1, "Prompt content is required"),
});

export async function POST(req: Request, props: { params: Promise<{ projectId: string; sessionId: string }> }) {
  try {
    await props.params;
    const body = await req.json();
    const { promptContent } = GenerateNameSchema.parse(body);

    const result = await generatePromptName(promptContent);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ name: result.name });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    console.error("Generate prompt name error:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate prompt name." },
      { status: 500 }
    );
  }
}
