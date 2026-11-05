import { deleteRenderTemplate, getRenderTemplate, updateRenderTemplate } from "@/lib/actions/render-template";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

export const GET = apiHandler<{ projectId: string; templateId: string }>(async (_req, ctx) => {
  const { projectId, templateId } = await ctx.params;

  const template = await getRenderTemplate({ projectId, templateId });

  return Response.json(template);
});

export const PUT = withAudit<{ projectId: string; templateId: string }>(
  { resource: "render_template", action: "update" },
  async (req, ctx, audit) => {
    const { projectId, templateId } = await ctx.params;
    const body = await req.json();

    const result = await updateRenderTemplate({
      projectId,
      templateId,
      name: body.name,
      code: body.code,
      whereClause: body.whereClause,
    });
    await audit.target(templateId);

    return Response.json(result);
  }
);

export const DELETE = withAudit<{ projectId: string; templateId: string }>(
  { resource: "render_template", action: "delete" },
  async (_req, ctx, audit) => {
    const { projectId, templateId } = await ctx.params;
    await audit.target(templateId);

    const result = await deleteRenderTemplate({ projectId, templateId });

    return Response.json(result);
  }
);
