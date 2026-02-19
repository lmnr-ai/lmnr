import { type NextRequest, NextResponse } from "next/server";

import { addAddon, isAddonActive, removeAddon, resolveAndValidate } from "@/lib/checkout/actions";

type Params = { params: Promise<{ workspaceId: string; addonKey: string }> };
/**
 * POST /api/workspaces/:workspaceId/addons/:addonKey
 * Adds the specified addon to the workspace's active subscription.
 * Charges a pro-rated amount immediately via Stripe.
 */
export async function POST(_req: NextRequest, props: Params): Promise<Response> {
  const { workspaceId, addonKey } = await props.params;

  const validation = await resolveAndValidate(workspaceId, addonKey);
  if (validation.error) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const alreadyActive = await isAddonActive(workspaceId, validation.addonConfig.slug);
  if (alreadyActive) {
    return NextResponse.json(
      { error: `The "${validation.addonConfig.name}" addon is already active on this workspace.` },
      { status: 409 }
    );
  }

  try {
    await addAddon(workspaceId, addonKey);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add addon";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/workspaces/:workspaceId/addons/:addonKey
 * Removes the specified addon from the workspace's active subscription.
 * Issues a pro-rated credit note for the unused portion.
 */
export async function DELETE(_req: NextRequest, props: Params): Promise<Response> {
  const { workspaceId, addonKey } = await props.params;

  const validation = await resolveAndValidate(workspaceId, addonKey);
  if (validation.error) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const isActive = await isAddonActive(workspaceId, validation.addonConfig.slug);
  if (!isActive) {
    return NextResponse.json(
      { error: `The "${validation.addonConfig.name}" addon is not active on this workspace.` },
      { status: 409 }
    );
  }

  try {
    await removeAddon(workspaceId, addonKey);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove addon";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
