import { createLlmProfile, listLlmProfiles } from "@/lib/actions/llm-profiles";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

type Params = { workspaceId: string };

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  return Response.json(await listLlmProfiles({ workspaceId }));
});

export const POST = withAudit<Params>({ resource: "llm_profile", action: "create" }, async (req, ctx, audit) => {
  const { workspaceId } = await ctx.params;
  const body = await req.json();
  const profile = await createLlmProfile({ ...body, workspaceId });
  await audit.target(profile.id, { name: profile.name });
  return Response.json(profile, { status: 201 });
});
