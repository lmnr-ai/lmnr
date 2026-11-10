import { startStarterNow } from "@/lib/actions/checkout/trial";
import { handlerWithAudit } from "@/lib/audit";

export const POST = handlerWithAudit<{ workspaceId: string }>(
  { resource: "subscription", action: "update", noTarget: true },
  async (_req, ctx) => {
    const { workspaceId } = await ctx.params;
    await startStarterNow(workspaceId);
    return Response.json({ success: true });
  }
);
