import { type NextRequest } from "next/server";

import { getTrialTaskFiles } from "@/lib/actions/evaluation/files";
import { apiHandler } from "@/lib/api/api-handler";

import { trialTaskRefOf } from "./ref";

/**
 * A trial's task dir: the pushed task version (`?task=` + `?hash=`, the datapoint's
 * `task_id` / `task_version_hash`) when the project has it, else the task dir of
 * the run's uploaded evals folder (`?taskPath=`, remote runs).
 */
export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (req: NextRequest, ctx) => {
  const { projectId, evaluationId } = await ctx.params;
  return Response.json(await getTrialTaskFiles(projectId, evaluationId, trialTaskRefOf(req.nextUrl.searchParams)));
});
