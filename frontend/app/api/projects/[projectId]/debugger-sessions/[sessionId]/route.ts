import { updateDebuggerSessionName } from "@/lib/actions/debugger-sessions";
import { withAudit } from "@/lib/audit";

export const PATCH = withAudit<{ projectId: string; sessionId: string }>(
  { resource: "debugger_session", action: "update" },
  async (req, ctx) => {
    const { projectId, sessionId } = await ctx.params;
    const { name } = await req.json();
    return Response.json(await updateDebuggerSessionName({ projectId, id: sessionId, name }));
  }
);
