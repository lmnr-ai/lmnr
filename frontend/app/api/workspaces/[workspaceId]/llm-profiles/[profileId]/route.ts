import { deleteLlmProfile, updateLlmProfile } from "@/lib/actions/llm-profiles";
import { withAudit } from "@/lib/audit";

type Params = { workspaceId: string; profileId: string };

export const PUT = withAudit<Params>({ resource: "llm_profile", action: "update" }, async (req, ctx) => {
  const { workspaceId, profileId } = await ctx.params;
  const body = await req.json();
  return Response.json(await updateLlmProfile({ ...body, workspaceId, profileId }));
});

export const DELETE = withAudit<Params>({ resource: "llm_profile", action: "delete" }, async (_req, ctx) => {
  const { workspaceId, profileId } = await ctx.params;
  await deleteLlmProfile({ workspaceId, profileId });
  return Response.json({ success: true });
});
