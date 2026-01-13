import { NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { executeSemanticEvent } from "@/lib/actions/semantic-event-definitions/execute";

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json();
    const result = await executeSemanticEvent(body);

    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
