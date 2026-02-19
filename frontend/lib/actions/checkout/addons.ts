import { and, eq } from "drizzle-orm";

import { deleteAllProjectsWorkspaceInfoFromCache } from "@/lib/actions/project";
import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { db } from "@/lib/db/drizzle";
import { subscriptionTiers, workspaceAddons, workspaces } from "@/lib/db/migrations/schema";

import { stripe } from "./stripe";
import { ADDON_CONFIG } from "./types";

export const addAddon = async (workspaceId: string, addonLookupKey: string): Promise<void> => {
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner"] });

  const workspace = await db
    .select({ subscriptionId: workspaces.subscriptionId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace[0]?.subscriptionId) {
    throw new Error("No active subscription found. Subscribe to a paid plan first.");
  }

  const s = stripe();

  const existingItems = await s.subscriptionItems.list({ subscription: workspace[0].subscriptionId });
  const alreadyHasAddon = existingItems.data.some((item) => item.price.lookup_key === addonLookupKey);
  if (alreadyHasAddon) {
    throw new Error(`Addon "${addonLookupKey}" is already active on this subscription.`);
  }

  const addonPrices = await s.prices.list({ lookup_keys: [addonLookupKey] });
  const addonPrice = addonPrices.data.find((p) => p.lookup_key === addonLookupKey);
  if (!addonPrice) {
    throw new Error(`Addon price "${addonLookupKey}" not found in Stripe.`);
  }

  await s.subscriptionItems.create({
    subscription: workspace[0].subscriptionId,
    price: addonPrice.id,
    proration_behavior: "always_invoice",
  });

  const addonSlug = ADDON_CONFIG[addonLookupKey]?.slug;
  if (addonSlug) {
    await db.insert(workspaceAddons).values({ workspaceId, addonSlug }).onConflictDoNothing();
  }

  await deleteAllProjectsWorkspaceInfoFromCache(workspaceId);
};

export const removeAddon = async (workspaceId: string, addonLookupKey: string): Promise<void> => {
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner"] });

  const workspace = await db
    .select({ subscriptionId: workspaces.subscriptionId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace[0]?.subscriptionId) {
    throw new Error("No active subscription found.");
  }

  const s = stripe();

  const existingItems = await s.subscriptionItems.list({ subscription: workspace[0].subscriptionId });
  const addonItem = existingItems.data.find((item) => item.price.lookup_key === addonLookupKey);
  if (!addonItem) {
    throw new Error(`Addon "${addonLookupKey}" is not active on this subscription.`);
  }

  await s.subscriptionItems.del(addonItem.id, {
    proration_behavior: "always_invoice",
  });

  const addonSlug = ADDON_CONFIG[addonLookupKey]?.slug;
  if (addonSlug) {
    await db
      .delete(workspaceAddons)
      .where(and(eq(workspaceAddons.workspaceId, workspaceId), eq(workspaceAddons.addonSlug, addonSlug)));
  }

  await deleteAllProjectsWorkspaceInfoFromCache(workspaceId);
};

export const resolveAndValidate = async (workspaceId: string, addonKey: string) => {
  const addonConfig = ADDON_CONFIG[addonKey];
  if (!addonConfig) {
    return { error: `Unknown addon: "${addonKey}"`, status: 404 } as const;
  }

  const workspace = await db
    .select({ tierName: subscriptionTiers.name })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(subscriptionTiers.id, workspaces.tierId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace[0]) {
    return { error: "Workspace not found", status: 404 } as const;
  }

  const tierName = workspace[0].tierName.toLowerCase().trim();
  if (!addonConfig.eligibleTiers.includes(tierName)) {
    return {
      error: `The "${addonConfig.name}" addon requires one of these tiers: ${addonConfig.eligibleTiers.join(", ")}. Current tier: ${workspace[0].tierName}.`,
      status: 400,
    } as const;
  }

  return { error: null, addonConfig } as const;
};

export const isAddonActive = async (workspaceId: string, slug: string): Promise<boolean> => {
  const result = await db
    .select({ id: workspaceAddons.id })
    .from(workspaceAddons)
    .where(and(eq(workspaceAddons.workspaceId, workspaceId), eq(workspaceAddons.addonSlug, slug)))
    .limit(1);
  return result.length > 0;
};
