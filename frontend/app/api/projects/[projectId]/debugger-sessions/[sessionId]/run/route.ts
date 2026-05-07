import { runDebuggerSession } from "@/lib/actions/debugger-sessions";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ projectId: string; sessionId: string }>(async (req, ctx) => {
  const { sessionId, projectId } = await ctx.params;
  const body = await req.json();

  const result = await runDebuggerSession({
    projectId,
    sessionId,
    ...body,
  });

  return Response.json(result);
});
