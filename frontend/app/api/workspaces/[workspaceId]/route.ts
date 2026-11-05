import { deleteWorkspace, getWorkspace, updateWorkspace } from "@/lib/actions/workspace";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

export const POST = withAudit<{ workspaceId: string }>(
  { resource: "workspace", action: "update" },
  async (req, ctx, audit) => {
    const { workspaceId } = await ctx.params;

    const body = await req.json();
    audit.set({ metadata: { fields: Object.keys(body ?? {}) } });
    await audit.target(workspaceId, { name: body?.name });

    await updateWorkspace({ workspaceId, ...body });

    return Response.json({ message: "Workspace renamed successfully." });
  }
);

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  const workspace = await getWorkspace({ workspaceId });

  return Response.json(workspace);
});

export const DELETE = withAudit<{ workspaceId: string }>(
  { resource: "workspace", action: "delete" },
  async (_req, ctx, audit) => {
    const { workspaceId } = await ctx.params;
    await audit.target(workspaceId);

    await deleteWorkspace({ workspaceId });

    return Response.json({ success: true });
  }
);
