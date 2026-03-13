import { deleteSqlTemplate, updateSqlTemplate } from "@/lib/actions/sql/templates";
import { handleRoute } from "@/lib/api/route-handler";

export const PUT = handleRoute<{ projectId: string; templateId: string }, unknown>(async (req, params) => {
  const body = await req.json();
  return await updateSqlTemplate({
    projectId: params.projectId,
    templateId: params.templateId,
    ...body,
  });
});

export const DELETE = handleRoute<{ projectId: string; templateId: string }, unknown>(async (_req, params) => {
  await deleteSqlTemplate({
    projectId: params.projectId,
    templateId: params.templateId,
  });
  return { message: "SQL template deleted successfully" };
});
