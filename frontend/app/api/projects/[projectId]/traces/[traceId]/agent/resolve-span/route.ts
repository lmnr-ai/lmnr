import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { resolveSpanId } from "@/lib/actions/span";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string; traceId: string }> }) {
  const { projectId, traceId } = await props.params;

  try {
    const resolved = await resolveSpanId({
      projectId,
      traceId,
      sequentialId: req.nextUrl.searchParams.get("id"),
    });

    if (!resolved) {
      return Response.json({ error: "Span not found" }, { status: 404 });
    }

    return Response.json(resolved);
  } catch (error) {
    console.error(error);

    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to resolve span ID." },
      { status: 500 }
    );
  }
}
