import { type NextRequest } from "next/server";

import { getEvaluationFiles } from "@/lib/actions/evaluation/files";
import { apiHandler } from "@/lib/api/api-handler";

/**
 * The dataset dir of the evals folder the evaluation's remote run uploaded,
 * with only the `?task=` task (the trial's `metadata.task_path`) of its tasks.
 */
export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (req: NextRequest, ctx) => {
  const { projectId, evaluationId } = await ctx.params;
  const task = req.nextUrl.searchParams.get("task") || null;
  return Response.json(await getEvaluationFiles(projectId, evaluationId, task));
});
