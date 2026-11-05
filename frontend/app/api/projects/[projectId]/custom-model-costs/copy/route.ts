import { copyCustomModelCosts } from "@/lib/actions/custom-model-costs";
import { withAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";
import { isUserMemberOfProject } from "@/lib/authorization";

export const POST = withAudit<{ projectId: string }>(
  { resource: "custom_model_cost", action: "create" },
  async (req, ctx, audit) => {
    const { projectId } = await ctx.params;
    const { targetProjectId } = await req.json();

    if (!targetProjectId) {
      return Response.json({ error: "targetProjectId is required" }, { status: 400 });
    }

    // The source project (projectId) is implicitly authorized via DB filtering,
    // consistent with other project routes. The target project needs an explicit check
    // because it comes from the request body and is not covered by the URL path.
    const session = await getServerSession();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await isUserMemberOfProject(targetProjectId, session.user.id))) {
      return Response.json({ error: "Forbidden: no access to target project" }, { status: 403 });
    }
    // The costs are created in the target project, so that is whose log records it.
    audit.set({ projectId: targetProjectId, metadata: { sourceProjectId: projectId } });

    const result = await copyCustomModelCosts({ sourceProjectId: projectId, targetProjectId });

    if (result.length === 0) {
      return Response.json({ error: "No custom model costs found in source project" }, { status: 400 });
    }
    await audit.target(result.map((cost) => cost.id));

    return Response.json(result);
  }
);
