import { updateDebuggerSessionName } from "@/lib/actions/debugger-sessions";
import { handlerWithAudit } from "@/lib/audit";

export const PATCH = handlerWithAudit<{ projectId: string; sessionId: string }>(
  { resource: "debugger_session", action: "update" },
  async (req, ctx, audit) => {
    const { projectId, sessionId } = await ctx.params;
    const { name } = await req.json();
    const session = await updateDebuggerSessionName({ projectId, id: sessionId, name });
    await audit.target(sessionId);
    return Response.json(session);
  }
);
