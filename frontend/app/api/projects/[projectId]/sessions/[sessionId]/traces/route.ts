import { getSessionTraces } from "@/lib/actions/sessions";
import { handlerWithAudit } from "@/lib/audit";

export const GET = handlerWithAudit<{ projectId: string; sessionId: string }>(
  { resource: "session", action: "view", read: true },
  async (req, ctx, audit) => {
    const { projectId, sessionId } = await ctx.params;
    // One event per open; live refreshes and hover previews send background=1.
    if (req.nextUrl.searchParams.get("background") === "1") audit.skip();
    else await audit.target(sessionId, { name: sessionId });
    return Response.json(await getSessionTraces({ projectId, sessionId }));
  }
);
