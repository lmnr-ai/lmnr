import { addAddon, isAddonActive, removeAddon, resolveAndValidate } from "@/lib/actions/checkout/addons";
import { withAudit } from "@/lib/audit";

type Params = { workspaceId: string; addonKey: string };

/**
 * POST /api/workspaces/:workspaceId/addons/:addonKey
 * Adds the specified addon to the workspace's active subscription.
 * Charges a pro-rated amount immediately via Stripe.
 */
// The addon key is recorded from the path.
export const POST = withAudit<Params>(
  { resource: "subscription", action: "update", noTarget: true },
  async (_req, ctx) => {
    const { workspaceId, addonKey } = await ctx.params;

    const validation = await resolveAndValidate(workspaceId, addonKey);
    if (validation.error) {
      return Response.json({ error: validation.error }, { status: validation.status });
    }

    const alreadyActive = await isAddonActive(workspaceId, validation.addonConfig.slug);
    if (alreadyActive) {
      return Response.json(
        { error: `The "${validation.addonConfig.name}" addon is already active on this workspace.` },
        { status: 409 }
      );
    }

    try {
      await addAddon(workspaceId, addonKey);
      return Response.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add addon";
      return Response.json({ error: message }, { status: 400 });
    }
  }
);

/**
 * DELETE /api/workspaces/:workspaceId/addons/:addonKey
 * Removes the specified addon from the workspace's active subscription.
 * Issues a pro-rated credit note for the unused portion.
 */
export const DELETE = withAudit<Params>(
  { resource: "subscription", action: "update", noTarget: true },
  async (_req, ctx) => {
    const { workspaceId, addonKey } = await ctx.params;

    const validation = await resolveAndValidate(workspaceId, addonKey);
    if (validation.error) {
      return Response.json({ error: validation.error }, { status: validation.status });
    }

    const isActive = await isAddonActive(workspaceId, validation.addonConfig.slug);
    if (!isActive) {
      return Response.json(
        { error: `The "${validation.addonConfig.name}" addon is not active on this workspace.` },
        { status: 409 }
      );
    }

    try {
      await removeAddon(workspaceId, addonKey);
      return Response.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove addon";
      return Response.json({ error: message }, { status: 400 });
    }
  }
);
