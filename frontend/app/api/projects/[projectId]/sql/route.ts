import { executeQuery } from "@/lib/actions/sql";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ projectId: string }>(async (request, ctx) => {
  const body = await request.json();
  const projectId = (await ctx.params).projectId;

  const data = await executeQuery({ ...body, projectId });

  return Response.json(data);
});
