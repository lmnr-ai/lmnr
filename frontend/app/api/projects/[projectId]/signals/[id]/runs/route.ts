import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { getSignalRuns, GetSignalRunsSchema } from "@/lib/actions/signal-runs";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; id: string }>(async (req, ctx) => {
  const { projectId, id: signalId } = await ctx.params;
  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetSignalRunsSchema.omit({ projectId: true, signalId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const result = await getSignalRuns({ ...parseResult.data, projectId, signalId });
  return Response.json(result);
});
