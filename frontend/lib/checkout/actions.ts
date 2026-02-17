"use server";

import { eq, sql } from "drizzle-orm";
import Stripe from "stripe";

import { deleteAllProjectsWorkspaceInfoFromCache } from "../actions/project";
import { checkUserWorkspaceRole } from "../actions/workspace/utils";
import { cache, WORKSPACE_LIMITS_CACHE_KEY } from "../cache";
import { db } from "../db/drizzle";
import { subscriptionTiers, workspaces } from "../db/migrations/schema";
import { METER_EVENT_NAMES, type PaidTier, TIER_CONFIG } from "./constants";

function stripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
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
  const subscription = await s.subscriptions.retrieve(workspace[0].subscriptionId);

  // Debug logging to investigate subscription status issue
  console.log("[getSubscriptionDetails] Debug info:", {
    subscriptionId: subscription.id,
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_end: subscription.current_period_end,
    current_period_start: subscription.current_period_start,
    items: subscription.items.data.map((item) => ({
      id: item.id,
      lookup_key: item.price.lookup_key,
      product: item.price.product,
    })),
  });

  const tierName = workspace[0].tierName.toLowerCase().trim() as PaidTier;
  const currentTier = tierName === "hobby" || tierName === "pro" ? tierName : "hobby";

  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  return {
    subscriptionId: subscription.id,
    status: subscription.status,
    currentTier,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
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
    const invoice = await s.invoices.retrieveUpcoming({
      subscription: workspace[0].subscriptionId,
    });

    return {
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      periodEnd: invoice.period_end,
      lines: invoice.lines.data.map((line) => ({
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

  const subscription = await s.subscriptions.update(workspace[0].subscriptionId, { cancel_at_period_end: true });

  let upcomingInvoice: UpcomingInvoiceInfo | null = null;
  try {
    const invoice = await s.invoices.retrieveUpcoming({
      subscription: subscription.id,
    });
    upcomingInvoice = {
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      periodEnd: invoice.period_end,
      lines: invoice.lines.data.map((line) => ({
        description: line.description,
        amount: line.amount,
      })),
    };
  } catch {
    // No upcoming invoice
  }

  return {
    cancelAt: subscription.current_period_end,
    upcomingInvoice,
  };
}

async function getMeterEventSummary(
  s: Stripe,
  meterEventName: string,
  customerId: string,
  startTime: number,
  endTime: number
): Promise<number> {
  // List meters to find the one matching the event name
  const meters = await s.billing.meters.list({ limit: 100 });
  const meter = meters.data.find((m) => m.event_name === meterEventName);

  if (!meter) {
    console.log(`Meter not found for event name: ${meterEventName}`);
    return 0;
  }

  const summaries = await s.billing.meters.listEventSummaries(meter.id, {
    customer: customerId,
    start_time: startTime,
    end_time: endTime,
  });

  if (summaries.data.length === 0) {
    return 0;
  }

  return summaries.data[0].aggregated_value;
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

  const currentTierConfig =
    currentTierName === "hobby" || currentTierName === "pro" ? TIER_CONFIG[currentTierName as PaidTier] : null;

  if (!currentTierConfig) {
    throw new Error(`Cannot switch from ${currentTierName} tier. Use the checkout page to subscribe.`);
  }

  const newTierConfig = TIER_CONFIG[newTier];
  const s = stripe();

  // Step 1: Get the current subscription and its items
  const subscription = await s.subscriptions.retrieve(workspace[0].subscriptionId, { expand: ["items.data.price"] });

  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  // Step 2: Retrieve current meter values
  const now = Math.floor(Date.now() / 1000);
  const periodStart = subscription.current_period_start;

  const [currentBytesOverage, currentSignalRunsOverage] = await Promise.all([
    getMeterEventSummary(s, METER_EVENT_NAMES.overageBytes.eventName, stripeCustomerId, periodStart, now),
    getMeterEventSummary(s, METER_EVENT_NAMES.overageSignalRuns.eventName, stripeCustomerId, periodStart, now),
  ]);

  // Step 3: Resolve new prices
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

  // Step 4: Build subscription update — remove old items, add new ones
  const itemsUpdate: Stripe.SubscriptionUpdateParams.Item[] = [
    // Delete all existing items
    ...subscription.items.data.map((item) => ({
      id: item.id,
      deleted: true as const,
    })),
    // Add new items
    { price: newFlatPrice.id, quantity: 1 },
    { price: newBytesOveragePrice.id },
    { price: newSignalRunsOveragePrice.id },
  ];

  await s.subscriptions.update(workspace[0].subscriptionId, {
    items: itemsUpdate,
    proration_behavior: "none",
  });

  // Step 5: Calculate new overage values
  const includedBytesDiff = newTierConfig.includedBytes - currentTierConfig.includedBytes;
  const includedSignalRunsDiff = newTierConfig.includedSignalRuns - currentTierConfig.includedSignalRuns;

  // Upgrading (hobby -> pro): subtract the difference (more included = less overage)
  // Downgrading (pro -> hobby): add the difference (less included = more overage)
  const newBytesOverage = Math.max(0, currentBytesOverage - includedBytesDiff);
  const newSignalRunsOverage = Math.max(0, currentSignalRunsOverage - includedSignalRunsDiff);

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
  await cache.remove(`${WORKSPACE_LIMITS_CACHE_KEY}:${workspaceId}`);
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
