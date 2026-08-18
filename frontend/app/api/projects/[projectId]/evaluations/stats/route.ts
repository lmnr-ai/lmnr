import { prettifyError, ZodError } from "zod/v4";

import { getEvaluationRunStats, GetEvaluationRunStatsSchema } from "@/lib/actions/evaluations/stats";

export async function GET(req: Request, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;
  const evaluationIds = new URL(req.url).searchParams.getAll("evaluationId");

  const parseResult = GetEvaluationRunStatsSchema.safeParse({ projectId, evaluationIds });
  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const stats = await getEvaluationRunStats(parseResult.data.projectId, parseResult.data.evaluationIds);
    return Response.json(Object.fromEntries(stats));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch evaluation stats." },
      { status: 500 }
    );
  }
}
