import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getEvaluationDatapointComparison, GetEvaluationDatapointComparisonSchema } from "@/lib/actions/evaluation";

// POST (not GET): the run-id list is unbounded (a group can have hundreds of
// runs), so it rides the body rather than a query string that would blow the
// URL-length limit and force a client-side cap.
export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;

  const body = (await req.json().catch(() => null)) as { evaluationIds?: unknown; index?: unknown } | null;

  const parseResult = GetEvaluationDatapointComparisonSchema.safeParse({
    projectId,
    evaluationIds: body?.evaluationIds,
    index: body?.index,
  });

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const rows = await getEvaluationDatapointComparison(parseResult.data);
    return Response.json({ rows });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch datapoint comparison." },
      { status: 500 }
    );
  }
}
