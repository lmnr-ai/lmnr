import { getEvaluationCellValue } from "@/lib/actions/evaluation";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (req, ctx) => {
  const { projectId, evaluationId } = await ctx.params;

  const trialId = req.nextUrl.searchParams.get("trialId");
  const column = req.nextUrl.searchParams.get("column");

  if (!trialId || !column) {
    return Response.json({ error: "trialId and column are required" }, { status: 400 });
  }

  const value = await getEvaluationCellValue({ projectId, evaluationId, trialId, column });
  return Response.json({ value });
});
