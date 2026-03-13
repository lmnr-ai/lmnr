import { registerEvaluatorToSpanPath, unregisterEvaluatorFromSpanPath } from "@/lib/actions/evaluator/span-path";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string; evaluatorId: string }, unknown>(async (req, params) => {
  const { projectId, evaluatorId } = params;
  const body = await req.json();

  return await registerEvaluatorToSpanPath({
    projectId,
    evaluatorId,
    ...body,
  });
});

export const DELETE = handleRoute<{ projectId: string; evaluatorId: string }, unknown>(async (req, params) => {
  const { projectId, evaluatorId } = params;
  const body = await req.json();

  return await unregisterEvaluatorFromSpanPath({
    projectId,
    evaluatorId,
    ...body,
  });
});
