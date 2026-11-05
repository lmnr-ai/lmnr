import { deleteWorkspace, getWorkspace, updateWorkspace } from "@/lib/actions/workspace";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;

  const body = await req.json();

  await updateWorkspace({ workspaceId, ...body });

  return Response.json({ message: "Workspace renamed successfully." });
});

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  const workspace = await getWorkspace({ workspaceId });

  return Response.json(workspace);
});

export const DELETE = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;

  await deleteWorkspace({ workspaceId });

  return Response.json({ success: true });
});
