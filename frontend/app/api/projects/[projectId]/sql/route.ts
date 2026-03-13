import { executeQuery } from "@/lib/actions/sql";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const body = await req.json();
  return await executeQuery({ ...body, projectId: params.projectId });
});
