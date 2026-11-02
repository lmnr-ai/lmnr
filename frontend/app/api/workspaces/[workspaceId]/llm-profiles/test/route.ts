import { testLlmProfile } from "@/lib/actions/llm-profiles/test";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const body = await req.json();
  return Response.json(await testLlmProfile({ ...body, workspaceId }));
});
