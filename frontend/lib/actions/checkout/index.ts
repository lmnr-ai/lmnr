"use server";

import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod/v4";

import { stripe } from "@/lib/actions/checkout/stripe";
import { deleteAllProjectsWorkspaceInfoFromCache } from "@/lib/actions/project";
import { getWorkspaceUsage } from "@/lib/actions/workspace";
import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { db } from "@/lib/db/drizzle";
import { subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";

import {
  type CancellationReason,
  METER_EVENT_NAMES,
  type PaidTier,
  type SubscriptionDetails,
  TIER_CONFIG,
  type UpcomingInvoiceInfo,
} from "./types";

const SwitchTierSchema = z.object({
  workspaceId: z.string(),
  tier: z.enum(["hobby", "pro"]),
});

const PaymentPortalSchema = z.object({
  workspaceId: z.string(),
  returnUrl: z.url(),
});

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

  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const invoice = typeof subscription.latest_invoice === "string" ? null : subscription.latest_invoice;
  const subscriptionLine = invoice?.lines.data.find((l) => l.parent?.type === "subscription_item_details");

  return {
    subscriptionId: subscription.id,
    status: subscription.status,
    currentTier: tierName,
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
    const preview = await s.invoices.createPreview({
      subscription: workspace[0].subscriptionId,
      expand: ["lines.data.pricing.price_details.price"],
    });
    const subscriptionLine = preview.lines.data.find((l) => l.parent?.type === "subscription_item_details");

    return {
      amountDue: preview.amount_due,
      currency: preview.currency,
      periodStart: subscriptionLine?.period.start ?? preview.period_start,
      lines: preview.lines.data.map((line) => {
        const priceObj = line.pricing?.price_details?.price;
        const lookupKey = typeof priceObj === "object" ? priceObj.lookup_key : null;

        return {
          lookupKey,
          amount: line.amount,
        };
      }),
    };
  } catch {
    return null;
  }
};

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
    const preview = await s.invoices.createPreview({
      subscription: workspace[0].subscriptionId,
      expand: ["lines.data.pricing.price_details.price"],
    });
    const previewLine = preview.lines.data.find((l) => l.parent?.type === "subscription_item_details");
    upcomingInvoice = {
      amountDue: preview.amount_due,
      currency: preview.currency,
      periodStart: previewLine?.period.start ?? preview.period_start,
      lines: preview.lines.data.map((line) => {
        const priceObj = line.pricing?.price_details?.price;
        const lookupKey = typeof priceObj === "object" ? priceObj.lookup_key : null;
        return {
          lookupKey,
          amount: line.amount,
        };
      }),
    };
  } catch {
    // No upcoming invoice
  }

  return {
    cancelAt,
    upcomingInvoice,
  };
};

export const switchTier = async (input: z.infer<typeof SwitchTierSchema>): Promise<void> => {
  const { workspaceId, tier: newTier } = SwitchTierSchema.parse(input);
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

  const usage = await getWorkspaceUsage(workspaceId);

  const newBytesOverage = Math.max(0, usage.totalBytesIngested - newTierConfig.includedBytes);
  const newSignalRunsOverage = Math.max(0, usage.totalSignalRuns - newTierConfig.includedSignalRuns);

  const subscription = await s.subscriptions.retrieve(workspace[0].subscriptionId);

  const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

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

  // Separate old items by billing type so each can be handled with the correct proration.
  const oldUsageItems = subscription.items.data.filter((item) => item.price.recurring?.usage_type === "metered");
  const oldFlatItems = subscription.items.data.filter((item) => item.price.recurring?.usage_type !== "metered");

  // Step 1: Swap metered overage items with no proration.
  // Usage-based charges are billed at the end of the cycle based on the active plan at that time;
  // charging for accrued metered usage immediately on a tier switch is not desired.
  await s.subscriptions.update(workspace[0].subscriptionId, {
    items: [
      ...oldUsageItems.map((item) => ({ id: item.id, deleted: true as const })),
      { price: newBytesOveragePrice.id },
      { price: newSignalRunsOveragePrice.id },
    ],
    proration_behavior: "none",
  });

  // Step 2: Swap the flat tier price with immediate proration invoice.
  // "always_invoice" immediately creates and collects an invoice for:
  // - prorated credit for unused time on the old tier
  // - prorated charge for remaining time on the new tier
  await s.subscriptions.update(workspace[0].subscriptionId, {
    items: [
      ...oldFlatItems.map((item) => ({ id: item.id, deleted: true as const })),
      { price: newFlatPrice.id, quantity: 1 },
    ],
    proration_behavior: "always_invoice",
  });

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

  await deleteAllProjectsWorkspaceInfoFromCache(workspaceId);
};

export const getPaymentMethodPortalUrl = async (input: z.infer<typeof PaymentPortalSchema>): Promise<string> => {
  const { workspaceId, returnUrl } = PaymentPortalSchema.parse(input);
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
