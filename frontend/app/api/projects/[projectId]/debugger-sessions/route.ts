import { type NextRequest } from "next/server";
import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { getDebuggerSessions, GetDebuggerSessionsSchema } from "@/lib/actions/debugger-sessions";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (request: NextRequest, ctx) => {
  const { projectId } = await ctx.params;

  const parseResult = parseUrlParams(request.nextUrl.searchParams, GetDebuggerSessionsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const result = await getDebuggerSessions({ ...parseResult.data, projectId });
  return Response.json(result);
});
