import { NextRequest } from "next/server";
import { prettifyError, z } from "zod/v4";

import { updateEvaluator } from "@/lib/actions/evaluator";

export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluatorId: string }> }
): Promise<Response> {
  try {
    const { projectId, evaluatorId } = await props.params;

    const body = await req.json();

    const updatedEvaluator = await updateEvaluator({
      projectId,
      evaluatorId,
      ...body,
    });

    return Response.json(updatedEvaluator);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: prettifyError(error), details: error.issues }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
