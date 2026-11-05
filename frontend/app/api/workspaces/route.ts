import { createWorkspace, getWorkspaces } from "@/lib/actions/workspaces";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

export const GET = apiHandler(async () => {
  const workspaces = await getWorkspaces();

  return Response.json(workspaces);
});

export const POST = withAudit({ resource: "workspace", action: "create" }, async (req, _ctx, audit) => {
  const body = await req.json();
  const workspace = await createWorkspace(body);
  audit.set({ workspaceId: workspace.id, resourceId: workspace.id, resourceLabel: workspace.name });

  return Response.json(workspace);
});
