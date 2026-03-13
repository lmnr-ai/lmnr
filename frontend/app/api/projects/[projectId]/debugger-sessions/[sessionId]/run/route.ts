import { runDebuggerSession } from "@/lib/actions/debugger-sessions";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string; sessionId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  return await runDebuggerSession({
    projectId: params.projectId,
    sessionId: params.sessionId,
    ...body,
  });
});
