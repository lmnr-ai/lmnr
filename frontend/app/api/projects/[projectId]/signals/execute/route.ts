import { executeSignal } from "@/lib/actions/signals/execute";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  const result = await executeSignal({ ...body, projectId });

  return Response.json(result);
});
