import { deleteLlmProfile, updateLlmProfile } from "@/lib/actions/llm-profiles";
import { handlerWithAudit } from "@/lib/audit";

type Params = { workspaceId: string; profileId: string };

export const PUT = handlerWithAudit<Params>({ resource: "llm_profile", action: "update" }, async (req, ctx, audit) => {
  const { workspaceId, profileId } = await ctx.params;
  const body = await req.json();
  const profile = await updateLlmProfile({ ...body, workspaceId, profileId });
  await audit.target(profileId);
  return Response.json(profile);
});

export const DELETE = handlerWithAudit<Params>(
  { resource: "llm_profile", action: "delete" },
  async (_req, ctx, audit) => {
    const { workspaceId, profileId } = await ctx.params;
    await audit.target(profileId);
    await deleteLlmProfile({ workspaceId, profileId });
    return Response.json({ success: true });
  }
);
