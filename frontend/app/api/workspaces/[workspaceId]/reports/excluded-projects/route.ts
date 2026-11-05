import { setExcludedProjects } from "@/lib/actions/reports";
import { withAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";

export const POST = withAudit<{ workspaceId: string }>(
  { resource: "report", action: "update" },
  async (request, ctx, audit) => {
    const { workspaceId } = await ctx.params;
    const session = await getServerSession();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const result = await setExcludedProjects({ ...body, workspaceId });
    audit.set({ metadata: { excludedProjectIds: body.excludedProjectIds } });
    await audit.target(body.reportId);
    return Response.json(result);
  }
);
