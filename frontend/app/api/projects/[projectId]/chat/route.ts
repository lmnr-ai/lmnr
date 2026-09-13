import { NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { handleChatGeneration } from "@/lib/actions/chat";
import { NotFoundError } from "@/lib/errors";
import { parseSystemMessages } from "@/lib/playground/utils";

export async function POST(req: Request, props: { params: Promise<{ projectId: string }> }) {
  try {
    const body = await req.json();
    const { projectId } = await props.params;

    const convertedMessages = body.messages ? parseSystemMessages(body.messages) : [];

    const params = {
      ...body,
      messages: convertedMessages,
      projectId,
    };

    const result = await handleChatGeneration({
      ...params,
      abortSignal: req.signal,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error.",
      },
      { status: 500 }
    );
  }
}
