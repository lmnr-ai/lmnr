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
    const result = await setSlackTargets({ ...body, workspaceId });
    audit.set({ metadata: { channels: body.channels?.map((c: { name: string }) => c.name) } });
    await audit.target(body.reportId);
    return Response.json(result);
  }
);
