"use server";

import { eq, sql } from "drizzle-orm";
import Stripe from "stripe";

import { deleteAllProjectsWorkspaceInfoFromCache } from "../actions/project";
import { getWorkspaceUsage } from "../actions/workspace";
import { checkUserWorkspaceRole } from "../actions/workspace/utils";
import { db } from "../db/drizzle";
import { subscriptionTiers, workspaces } from "../db/migrations/schema";
import { METER_EVENT_NAMES, type PaidTier, TIER_CONFIG } from "./constants";

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

export async function getUpcomingInvoice(workspaceId: string): Promise<UpcomingInvoiceInfo | null> {
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
}

export async function cancelSubscription(
  workspaceId: string
): Promise<{ cancelAt: number; upcomingInvoice: UpcomingInvoiceInfo | null }> {
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

  await s.subscriptions.update(workspace[0].subscriptionId, { cancel_at_period_end: true });
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
}

export async function switchTier(workspaceId: string, newTier: PaidTier): Promise<void> {
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
    proration_behavior: "none",
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
}

export async function getPaymentMethodPortalUrl(workspaceId: string, returnUrl: string): Promise<string> {
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });

  const details = await getSubscriptionDetails(workspaceId);
  if (!details) {
    throw new Error("No active subscription found");
  }

  const s = stripe();
  const portalSession = await s.billingPortal.sessions.create({
    customer: details.stripeCustomerId,
    return_url: returnUrl,
    flow_data: {
      type: "payment_method_update",
    },
  });

  return portalSession.url;
}
