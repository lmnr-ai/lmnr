import { type NextRequest } from "next/server";
import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { getEvaluationStatistics, GetEvaluationStatisticsSchema } from "@/lib/actions/evaluation";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (req: NextRequest, ctx) => {
  const { projectId, evaluationId } = await ctx.params;

  // Parse URL params using the schema
  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetEvaluationStatisticsSchema.omit({ evaluationId: true, projectId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    // Call the action to get evaluation statistics
    const result = await getEvaluationStatistics({
      ...parseResult.data,
      projectId,
      evaluationId,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Evaluation not found") {
      return Response.json({ error: "Evaluation not found" }, { status: 404 });
    }
    throw error;
  }
});
