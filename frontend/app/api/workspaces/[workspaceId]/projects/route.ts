import { createProject, getProjectsByWorkspace } from "@/lib/actions/projects";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;

  const projects = await getProjectsByWorkspace(workspaceId);

  return Response.json(projects);
});

// Auth: proxy.ts gates /api/workspaces/:workspaceId/* via isUserMemberOfWorkspace,
// so a non-member never reaches this handler — no in-handler authz needed.
export const POST = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const body = await req.json();

  const project = await createProject({ name: body.name, workspaceId });

  return Response.json(project);
});
