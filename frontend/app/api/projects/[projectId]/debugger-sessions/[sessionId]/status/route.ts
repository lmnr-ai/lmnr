import { updateDebuggerSessionStatus } from "@/lib/actions/debugger-sessions";
import { apiHandler } from "@/lib/api/api-handler";

export const PATCH = apiHandler<{ projectId: string; sessionId: string }>(async (req, ctx) => {
  const { sessionId, projectId } = await ctx.params;
  const body = await req.json();

  const result = await updateDebuggerSessionStatus({
    projectId,
    sessionId,
    ...body,
  });

  return Response.json(result);
});
