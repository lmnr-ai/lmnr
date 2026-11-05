import { isEvaluationPublic } from "@/lib/actions/evaluation/visibility";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (_req, ctx) => {
  const { evaluationId } = await ctx.params;
  const isPublic = await isEvaluationPublic(evaluationId);
  return Response.json({ visibility: isPublic ? "public" : "private" });
});
