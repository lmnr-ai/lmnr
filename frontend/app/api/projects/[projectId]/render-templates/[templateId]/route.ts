import { deleteRenderTemplate, getRenderTemplate, updateRenderTemplate } from "@/lib/actions/render-template";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; templateId: string }>(async (_req, ctx) => {
  const { projectId, templateId } = await ctx.params;

  const template = await getRenderTemplate({ projectId, templateId });

  return Response.json(template);
});

export const PUT = apiHandler<{ projectId: string; templateId: string }>(async (req, ctx) => {
  const { projectId, templateId } = await ctx.params;
  const body = await req.json();

  const result = await updateRenderTemplate({
    projectId,
    templateId,
    name: body.name,
    code: body.code,
  });

  return Response.json(result);
});

export const DELETE = apiHandler<{ projectId: string; templateId: string }>(async (_req, ctx) => {
  const { projectId, templateId } = await ctx.params;

  const result = await deleteRenderTemplate({ projectId, templateId });

  return Response.json(result);
});
