import { updateDebuggerSessionName } from "@/lib/actions/debugger-sessions";
import { apiHandler } from "@/lib/api/api-handler";

export const PATCH = apiHandler<{ projectId: string; sessionId: string }>(async (req, ctx) => {
  const { projectId, sessionId } = await ctx.params;
  const { name } = await req.json();
  return Response.json(await updateDebuggerSessionName({ projectId, id: sessionId, name }));
});
