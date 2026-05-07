import { getProjectsByWorkspace } from "@/lib/actions/projects";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;

  const projects = await getProjectsByWorkspace(workspaceId);

  return Response.json(projects);
});
