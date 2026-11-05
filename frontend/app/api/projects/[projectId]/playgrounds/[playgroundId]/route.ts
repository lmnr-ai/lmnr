import { updatePlayground } from "@/lib/actions/playgrounds";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ projectId: string; playgroundId: string }>(async (req, ctx) => {
  const { projectId, playgroundId } = await ctx.params;
  const body = await req.json();
  return Response.json(await updatePlayground({ ...body, projectId, playgroundId }));
});
