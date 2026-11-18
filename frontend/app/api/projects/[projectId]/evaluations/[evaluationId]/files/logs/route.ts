import { type NextRequest } from "next/server";

import { getTrialLogs } from "@/lib/actions/evaluation/files";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";

/** The files of a trial's dir in the Harbor job its remote run uploaded, `?trial=` its Harbor trial name. */
export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (req: NextRequest, ctx) => {
  const { projectId, evaluationId } = await ctx.params;
  const trial = req.nextUrl.searchParams.get("trial");
  if (!trial) {
    throw new ApiError("trial is required", 400);
  }
  return Response.json(await getTrialLogs(projectId, evaluationId, trial));
});
