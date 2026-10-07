import { type NextRequest } from "next/server";
import { prettifyError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import {
  createDebuggerSession,
  CreateDebuggerSessionSchema,
  getDebuggerSessions,
  GetDebuggerSessionsSchema,
} from "@/lib/actions/debugger-sessions";
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

export const POST = apiHandler<{ projectId: string }>(async (request: NextRequest, ctx) => {
  const { projectId } = await ctx.params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body is allowed — id/name are optional
  }

  const parseResult = CreateDebuggerSessionSchema.omit({ projectId: true }).safeParse(body);
  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const session = await createDebuggerSession({ ...parseResult.data, projectId });
  return Response.json(session);
});
