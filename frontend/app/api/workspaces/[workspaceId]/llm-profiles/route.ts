import { createLlmProfile, listLlmProfiles } from "@/lib/actions/llm-profiles";
import { apiHandler } from "@/lib/api/api-handler";

type Params = { workspaceId: string };

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  return Response.json(await listLlmProfiles({ workspaceId }));
});

export const POST = apiHandler<Params>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const body = await req.json();
  return Response.json(await createLlmProfile({ ...body, workspaceId }), { status: 201 });
});
