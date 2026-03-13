import { parseUrlParams } from "@/lib/actions/common/utils.ts";
import { createSignalJob, getSignalJobs, GetSignalJobsSchema } from "@/lib/actions/signal-jobs";
import { checkSignalRunsLimit } from "@/lib/actions/usage/limits";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute(async (req, { projectId, id: signalId }) => {
  const url = new URL(req.url);
  const parseResult = parseUrlParams(url.searchParams, GetSignalJobsSchema.omit({ projectId: true, signalId: true }));

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return getSignalJobs({ ...parseResult.data, projectId, signalId });
});

export const POST = handleRoute(async (req, { projectId, id: signalId }) => {
  const body = await req.json();
  const tracesCount = Number(body.tracesCount) || 0;

  await checkSignalRunsLimit(projectId, tracesCount);

  return createSignalJob({ ...body, projectId, signalId });
});
