import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils.ts";
import { createSignalJob, getSignalJobs, GetSignalJobsSchema } from "@/lib/actions/signal-jobs";
import { checkSignalRunsLimit } from "@/lib/actions/usage/limits";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; id: string }>(async (req, ctx) => {
  const { projectId, id: signalId } = await ctx.params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetSignalJobsSchema.omit({ projectId: true, signalId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const result = await getSignalJobs({
    ...parseResult.data,
    projectId,
    signalId,
  });

  return Response.json(result);
});

export const POST = apiHandler<{ projectId: string; id: string }>(async (req, ctx) => {
  const { projectId, id: signalId } = await ctx.params;

  const body = await req.json();
  const tracesCount = Number(body.tracesCount) || 0;
  const mode = Number(body.mode) || 0;
  // Realtime signals are billed as 2 signal runs each
  const billedRuns = mode === 1 ? tracesCount * 2 : tracesCount;

  await checkSignalRunsLimit(projectId, billedRuns);

  const result = await createSignalJob({
    ...body,
    projectId,
    signalId,
  });

  return Response.json(result);
});
