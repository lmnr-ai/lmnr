import { createSqlTemplate, getSqlTemplates } from "@/lib/actions/sql/templates";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;

  const result = await getSqlTemplates({ projectId });

  return Response.json(result);
});

export const POST = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;

  const body = await req.json();

  const template = await createSqlTemplate({
    ...body,
    projectId,
  });

  return Response.json(template);
});
