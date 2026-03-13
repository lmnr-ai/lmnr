import { updateEvaluator } from "@/lib/actions/evaluator";
import { handleRoute } from "@/lib/api/route-handler";

export const PUT = handleRoute<{ projectId: string; evaluatorId: string }, unknown>(async (req, params) => {
  const { projectId, evaluatorId } = params;
  const body = await req.json();

  return await updateEvaluator({
    projectId,
    evaluatorId,
    ...body,
  });
});
