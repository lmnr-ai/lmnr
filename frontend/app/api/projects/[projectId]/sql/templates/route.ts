import { createSqlTemplate, getSqlTemplates } from "@/lib/actions/sql/templates";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string }, unknown>(
  async (_req, params) => await getSqlTemplates({ projectId: params.projectId })
);

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const body = await req.json();
  return await createSqlTemplate({
    ...body,
    projectId: params.projectId,
  });
});
