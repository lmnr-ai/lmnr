import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { generateSessionName } from "@/lib/actions/debugger-sessions/generate-name";

export async function POST(req: Request, props: { params: Promise<{ projectId: string; sessionId: string }> }) {
  try {
    const { projectId, sessionId } = await props.params;

    const result = await generateSessionName(projectId, sessionId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ name: result.name });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    console.error("Generate session name error:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate session name." },
      { status: 500 }
    );
  }
}
