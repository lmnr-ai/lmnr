import { createRenderTemplate, getRenderTemplates } from "@/lib/actions/render-template";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const type = req.nextUrl.searchParams.get("type") ?? undefined;

  // zod parse inside the action validates the raw query value
  const templates = await getRenderTemplates({ projectId, type: type as "span" | "trace" | undefined });

  return Response.json(templates);
});

export const POST = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();

  const result = await createRenderTemplate({
    projectId,
    name: body.name,
    code: body.code,
    type: body.type,
    whereClause: body.whereClause,
  });

  return Response.json(result);
});
