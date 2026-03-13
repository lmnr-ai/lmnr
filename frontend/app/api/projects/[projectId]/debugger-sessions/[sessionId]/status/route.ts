import { updateDebuggerSessionStatus } from "@/lib/actions/debugger-sessions";
import { handleRoute } from "@/lib/api/route-handler";

export const PATCH = handleRoute<{ projectId: string; sessionId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  return await updateDebuggerSessionStatus({
    projectId: params.projectId,
    sessionId: params.sessionId,
    ...body,
  });
});
