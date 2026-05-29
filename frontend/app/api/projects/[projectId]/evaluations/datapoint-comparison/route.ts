import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import {
  getEvaluationDatapointComparison,
  GetEvaluationDatapointComparisonSchema,
} from "@/lib/actions/evaluation";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;
  const sp = req.nextUrl.searchParams;

  const evaluationIds = sp
    .get("evaluationIds")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const indexRaw = sp.get("index");
  const indexNum = indexRaw != null ? Number(indexRaw) : NaN;

  const parseResult = GetEvaluationDatapointComparisonSchema.safeParse({
    projectId,
    evaluationIds,
    index: indexNum,
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
