import { deleteSqlTemplate, updateSqlTemplate } from "@/lib/actions/sql/templates";
import { apiHandler } from "@/lib/api/api-handler";

export const PUT = apiHandler<{ projectId: string; templateId: string }>(async (req, ctx) => {
  const { projectId, templateId } = await ctx.params;

  const body = await req.json();

  const updatedTemplate = await updateSqlTemplate({
    projectId,
    templateId,
    ...body,
  });

  return Response.json(updatedTemplate);
});

export const DELETE = apiHandler<{ projectId: string; templateId: string }>(async (_req, ctx) => {
  const { projectId, templateId } = await ctx.params;

  await deleteSqlTemplate({
    projectId,
    templateId,
  });

  return Response.json({ message: "SQL template deleted successfully" });
});
