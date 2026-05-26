import { createRenderTemplate } from "@/lib/actions/render-template";
import { getRenderTemplates } from "@/lib/actions/render-templates";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;

  const templates = await getRenderTemplates({ projectId });

  return Response.json(templates);
});

export const POST = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();

  const result = await createRenderTemplate({
    projectId,
    name: body.name,
    code: body.code,
  });

  return Response.json(result);
});
