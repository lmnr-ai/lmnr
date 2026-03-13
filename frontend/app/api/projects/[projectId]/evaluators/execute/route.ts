import { executeEvaluator } from "@/lib/actions/evaluator/execute";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, _params) => {
  const body = await req.json();
  return await executeEvaluator(body);
});
