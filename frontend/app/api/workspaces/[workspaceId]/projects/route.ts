import { createProject, getProjectsByWorkspace } from "@/lib/actions/projects";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;

  const projects = await getProjectsByWorkspace(workspaceId);

  return Response.json(projects);
});

// Auth: proxy.ts gates /api/workspaces/:workspaceId/* via isUserMemberOfWorkspace,
// so a non-member never reaches this handler — no in-handler authz needed.
export const POST = handlerWithAudit<{ workspaceId: string }>(
  { resource: "project", action: "create" },
  async (req, ctx, audit) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();

    const project = await createProject({ name: body.name, workspaceId });
    audit.set({ projectId: project.id });
    await audit.target(project.id, { name: project.name });

    return Response.json(project);
  }
);
