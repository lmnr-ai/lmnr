import { type NextRequest } from "next/server";
import { prettifyError, z } from "zod/v4";

import { registerEvaluatorToSpanPath, unregisterEvaluatorFromSpanPath } from "@/lib/actions/evaluator/span-path";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluatorId: string }> }
): Promise<Response> {
  try {
    const { projectId, evaluatorId } = await props.params;

    const body = await req.json();

    const result = await registerEvaluatorToSpanPath({
      projectId,
      evaluatorId,
      ...body,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: prettifyError(error), details: error.issues }, { status: 400 });
    }

    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluatorId: string }> }
): Promise<Response> {
  try {
    const { projectId, evaluatorId } = await props.params;

    const body = await req.json();

    const result = await unregisterEvaluatorFromSpanPath({
      projectId,
      evaluatorId,
      ...body,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: prettifyError(error), details: error.issues }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
