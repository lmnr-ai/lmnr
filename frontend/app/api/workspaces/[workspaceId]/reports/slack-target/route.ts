import { setSlackTargets } from "@/lib/actions/reports";
import { handlerWithAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";

export const POST = handlerWithAudit<{ workspaceId: string }>(
  { resource: "report", action: "update" },
  async (request, ctx, audit) => {
    const { workspaceId } = await ctx.params;

    const session = await getServerSession();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const result = await setSlackTargets({ ...body, workspaceId, userId: session.user.id });
    // Ids only: audit readers may not be members of a private channel.
    audit.set({ metadata: { channelIds: body.channels?.map((c: { id: string }) => c.id) } });
    await audit.target(body.reportId);
    return Response.json(result);
  }
);
