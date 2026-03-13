import { jsonToSql } from "@/lib/actions/sql";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const body = await req.json();
  const data = await jsonToSql({ projectId: params.projectId, ...body });
  return { success: true, sql: data };
});
