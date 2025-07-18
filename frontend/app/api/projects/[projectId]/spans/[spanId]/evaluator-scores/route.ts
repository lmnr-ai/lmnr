import { NextRequest } from "next/server";
import { prettifyError, z } from "zod/v4";

import { getEvaluatorScores } from "@/lib/actions/evaluator-scores";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { spanId, projectId } = params;

  try {
    const scores = await getEvaluatorScores({ spanId, projectId });

    return Response.json(scores);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: prettifyError(error), details: error.issues }, { status: 400 });
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch evaluator scores" },
      { status: 500 }
    );
  }
}
