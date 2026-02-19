"use server";

import { and, eq, sql } from "drizzle-orm";
import Stripe from "stripe";

import { deleteAllProjectsWorkspaceInfoFromCache } from "../actions/project";
import { getWorkspaceUsage } from "../actions/workspace";
import { checkUserWorkspaceRole } from "../actions/workspace/utils";
import { db } from "../db/drizzle";
import { subscriptionTiers, workspaceAddons, workspaces } from "../db/migrations/schema";
import { ADDON_CONFIG, METER_EVENT_NAMES, type PaidTier, TIER_CONFIG } from "./constants";

let stripeInstance: Stripe | null = null;

function stripe() {
  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripeInstance;
}

export interface SubscriptionDetails {
  subscriptionId: string;
  status: Stripe.Subscription.Status;
  currentTier: PaidTier;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string;
}

export interface UpcomingInvoiceInfo {
  amountDue: number;
  currency: string;
  periodEnd: number;
  lines: {
    description: string | null;
    amount: number;
  }[];
}

export async function getSubscriptionDetails(workspaceId: string): Promise<SubscriptionDetails | null> {
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });

  const workspace = await db
    .select({
      subscriptionId: workspaces.subscriptionId,
      tierName: subscriptionTiers.name,
    })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(subscriptionTiers.id, workspaces.tierId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace[0]?.subscriptionId) {
    return null;
  }

  const s = stripe();
  const subscription = await s.subscriptions.retrieve(workspace[0].subscriptionId, {
    expand: ["latest_invoice.lines"],
  });

  const tierName = workspace[0].tierName.toLowerCase().trim() as PaidTier;
  const currentTier = tierName === "hobby" || tierName === "pro" ? tierName : "hobby";

  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const invoice = typeof subscription.latest_invoice === "string" ? null : subscription.latest_invoice;
  const subscriptionLine = invoice?.lines.data.find((l) => l.parent?.type === "subscription_item_details");

  return {
    subscriptionId: subscription.id,
    status: subscription.status,
    currentTier,
    currentPeriodStart: subscriptionLine?.period.start ?? 0,
    currentPeriodEnd: subscriptionLine?.period.end ?? 0,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    stripeCustomerId,
  };
}

export const getUpcomingInvoice = async (workspaceId: string): Promise<UpcomingInvoiceInfo | null> => {
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });

  const workspace = await db
    .select({ subscriptionId: workspaces.subscriptionId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace[0]?.subscriptionId) {
    return null;
  }

  const s = stripe();

  try {
    const preview = await s.invoices.createPreview({ subscription: workspace[0].subscriptionId });
    const subscriptionLine = preview.lines.data.find((l) => l.parent?.type === "subscription_item_details");

    return {
      amountDue: preview.amount_due,
      currency: preview.currency,
      periodEnd: subscriptionLine?.period.end ?? preview.period_end,
      lines: preview.lines.data.map((line) => ({
        description: line.description,
        amount: line.amount,
      })),
    };
  } catch {
    // No upcoming invoice (e.g., subscription already canceled)
    return null;
  }
};

type CancellationReason =
  | "customer_service"
  | "low_quality"
  | "missing_features"
  | "other"
  | "switched_service"
  | "too_complex"
  | "too_expensive"
  | "unused";

export const cancelSubscription = async (
  workspaceId: string,
  cancellationReason: CancellationReason = "other",
  cancellationComment: string = ""
): Promise<{ cancelAt: number; upcomingInvoice: UpcomingInvoiceInfo | null }> => {
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner"] });

  const workspace = await db
    .select({ subscriptionId: workspaces.subscriptionId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace[0]?.subscriptionId) {
    throw new Error("No active subscription found");
  }

  const s = stripe();

  await s.subscriptions.update(workspace[0].subscriptionId, {
    cancel_at_period_end: true,
    cancellation_details: {
      feedback: cancellationReason as Stripe.Subscription.CancellationDetails.Feedback,
      comment: cancellationComment,
    },
  });
  const subscription = await s.subscriptions.retrieve(workspace[0].subscriptionId, {
    expand: ["latest_invoice.lines"],
  });

  const invoice = typeof subscription.latest_invoice === "string" ? null : subscription.latest_invoice;
  const subscriptionLine = invoice?.lines.data.find((l) => l.parent?.type === "subscription_item_details");
  const cancelAt = subscriptionLine?.period.end ?? Math.floor(Date.now() / 1000);

  let upcomingInvoice: UpcomingInvoiceInfo | null = null;
  try {
    const preview = await s.invoices.createPreview({ subscription: workspace[0].subscriptionId });
    const subscriptionLine = preview.lines.data.find((l) => l.parent?.type === "subscription_item_details");
    upcomingInvoice = {
      amountDue: preview.amount_due,
      currency: preview.currency,
      periodEnd: subscriptionLine?.period.end ?? preview.period_end,
      lines: preview.lines.data.map((line) => ({
        description: line.description,
        amount: line.amount,
      })),
    };
  } catch {
    // No upcoming invoice
  }

  return {
    cancelAt,
    upcomingInvoice,
  };
};

export const switchTier = async (workspaceId: string, newTier: PaidTier): Promise<void> => {
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner"] });

  const workspace = await db
    .select({
      subscriptionId: workspaces.subscriptionId,
      tierName: subscriptionTiers.name,
      stripeProductId: subscriptionTiers.stripeProductId,
    })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(subscriptionTiers.id, workspaces.tierId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace[0]?.subscriptionId) {
    throw new Error("No active subscription found. Use the checkout page to subscribe.");
  }

  const currentTierName = workspace[0].tierName.toLowerCase().trim();
  if (currentTierName === newTier) {
    throw new Error(`Already on the ${newTier} tier`);
  }

  if (currentTierName === "free") {
    throw new Error("Cannot switch from free tier. Use the checkout page to subscribe.");
  }

  const newTierConfig = TIER_CONFIG[newTier];
  const s = stripe();

  // Step 1: Fetch real current usage from cache/ClickHouse
  const usage = await getWorkspaceUsage(workspaceId);

  // Step 2: Calculate overage against the NEW tier's included amounts
  const newBytesOverage = Math.max(0, usage.totalBytesIngested - newTierConfig.includedBytes);
  const newSignalRunsOverage = Math.max(0, usage.totalSignalRuns - newTierConfig.includedSignalRuns);

  // Step 3: Get the current subscription and its items
  const subscription = await s.subscriptions.retrieve(workspace[0].subscriptionId);

  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  // Step 4: Resolve new prices
  const newPrices = await s.prices.list({
    lookup_keys: [
      newTierConfig.lookupKey,
      newTierConfig.overageBytesLookupKey,
      newTierConfig.overageSignalRunsLookupKey,
    ],
  });

  const newFlatPrice = newPrices.data.find((p) => p.lookup_key === newTierConfig.lookupKey);
  const newBytesOveragePrice = newPrices.data.find((p) => p.lookup_key === newTierConfig.overageBytesLookupKey);
  const newSignalRunsOveragePrice = newPrices.data.find(
    (p) => p.lookup_key === newTierConfig.overageSignalRunsLookupKey
  );

  if (!newFlatPrice || !newBytesOveragePrice || !newSignalRunsOveragePrice) {
    throw new Error("Could not resolve new tier prices in Stripe");
  }

  // Step 5: Update subscription — remove old items, add new ones
  const itemsUpdate: Stripe.SubscriptionUpdateParams.Item[] = [
    ...subscription.items.data.map((item) => ({
      id: item.id,
      deleted: true as const,
    })),
    { price: newFlatPrice.id, quantity: 1 },
    { price: newBytesOveragePrice.id },
    { price: newSignalRunsOveragePrice.id },
  ];

  await s.subscriptions.update(workspace[0].subscriptionId, {
    items: itemsUpdate,
    proration_behavior: "create_prorations",
  });

  // Step 6: Report new overage values to the meters
  const timestamp = Math.floor(Date.now() / 1000);

  await Promise.all([
    s.billing.meterEvents.create({
      event_name: METER_EVENT_NAMES.overageBytes.eventName,
      timestamp,
      payload: {
        stripe_customer_id: stripeCustomerId,
        [METER_EVENT_NAMES.overageBytes.payloadKey]: String(newBytesOverage),
      },
    }),
    s.billing.meterEvents.create({
      event_name: METER_EVENT_NAMES.overageSignalRuns.eventName,
      timestamp,
      payload: {
        stripe_customer_id: stripeCustomerId,
        [METER_EVENT_NAMES.overageSignalRuns.payloadKey]: String(newSignalRunsOverage),
      },
    }),
  ]);

  // Step 7: Update workspace tier in the database
  await db
    .update(workspaces)
    .set({
      tierId: sql`(
        SELECT id
        FROM subscription_tiers
        WHERE stripe_product_id = ${newFlatPrice.product}
      )`,
    })
    .where(eq(workspaces.id, workspaceId));

  await deleteAllProjectsWorkspaceInfoFromCache(workspaceId);
};

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

  // Check the addon isn't already on the subscription
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

  // Add the addon item to the subscription, charging pro-rated immediately
  await s.subscriptionItems.create({
    subscription: workspace[0].subscriptionId,
    price: addonPrice.id,
    proration_behavior: "always_invoice",
  });

  // Eagerly update DB; webhook will also handle this
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

  // Remove the addon item; credit any unused portion via a credit note (no immediate charge)
  await s.subscriptionItems.del(addonItem.id, {
    proration_behavior: "always_invoice",
  });

  // Eagerly remove from DB; webhook will also handle this
  const addonSlug = ADDON_CONFIG[addonLookupKey]?.slug;
  if (addonSlug) {
    await db
      .delete(workspaceAddons)
      .where(and(eq(workspaceAddons.workspaceId, workspaceId), eq(workspaceAddons.addonSlug, addonSlug)));
  }

  await deleteAllProjectsWorkspaceInfoFromCache(workspaceId);
};

export const getPaymentMethodPortalUrl = async (workspaceId: string, returnUrl: string): Promise<string> => {
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });

  const details = await getSubscriptionDetails(workspaceId);
  if (!details) {
    throw new Error("No active subscription found");
  }

  const s = stripe();
  const portalSession = await s.billingPortal.sessions.create({
    customer: details.stripeCustomerId,
    return_url: returnUrl,
  });

  return portalSession.url;
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
