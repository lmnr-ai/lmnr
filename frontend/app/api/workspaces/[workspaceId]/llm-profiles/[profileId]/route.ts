import { deleteLlmProfile, updateLlmProfile } from "@/lib/actions/llm-profiles";
import { apiHandler } from "@/lib/api/api-handler";

type Params = { workspaceId: string; profileId: string };

export const PUT = apiHandler<Params>(async (req, ctx) => {
  const { workspaceId, profileId } = await ctx.params;
  const body = await req.json();
  return Response.json(await updateLlmProfile({ ...body, workspaceId, profileId }));
});

export const DELETE = apiHandler<Params>(async (_req, ctx) => {
  const { workspaceId, profileId } = await ctx.params;
  await deleteLlmProfile({ workspaceId, profileId });
  return Response.json({ success: true });
});
