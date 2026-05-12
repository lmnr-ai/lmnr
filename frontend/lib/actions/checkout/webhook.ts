import { and, eq, sql } from "drizzle-orm";
import { type Stripe } from "stripe";

import { deleteAllProjectsWorkspaceInfoFromCache } from "@/lib/actions/project";
import {
  invalidateProjectCacheForWorkspace,
  invalidateUsageWarningsCacheForWorkspace,
} from "@/lib/actions/usage/utils";
import { cache, WORKSPACE_BYTES_USAGE_CACHE_KEY, WORKSPACE_SIGNAL_STEPS_USAGE_CACHE_KEY } from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import {
  subscriptionTiers,
  users,
  userSubscriptionInfo,
  workspaceAddons,
  workspaces,
  workspaceUsage,
  workspaceUsageLimits,
  workspaceUsageWarnings,
} from "@/lib/db/migrations/schema";

import { DATAPLANE_ADDON_LOOKUP_KEY, type PaidTier, TIER_CONFIG, type TierConfigEntry } from "./types";

interface ManageWorkspaceSubscriptionEventArgs {
  stripeCustomerId: string;
  productId: string;
  workspaceId: string;
  subscriptionId: string;
  cancel?: boolean;
}

export async function getUserSubscriptionInfo(
  email: string
): Promise<typeof userSubscriptionInfo.$inferSelect | undefined> {
  const existingStripeCustomers = await db
    .select()
    .from(userSubscriptionInfo)
    .innerJoin(users, eq(userSubscriptionInfo.userId, users.id))
    .where(eq(users.email, email));

  return existingStripeCustomers.length > 0 ? existingStripeCustomers[0].user_subscription_info : undefined;
}

export const manageWorkspaceSubscriptionEvent = async ({
  stripeCustomerId,
  productId,
  subscriptionId,
  workspaceId,
  cancel,
}: ManageWorkspaceSubscriptionEventArgs) => {
  await db
    .update(userSubscriptionInfo)
    .set({
      stripeCustomerId,
      activated: true,
    })
    .where(eq(userSubscriptionInfo.stripeCustomerId, stripeCustomerId));

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    with: {
      subscriptionTier: true,
    },
  });
  const currentTier = workspace?.subscriptionTier?.name.trim().toLowerCase();

  const updatedRows = await db
    .update(workspaces)
    .set({
      subscriptionId,
      tierId: sql`CASE
      WHEN ${cancel ?? false} THEN 1
      ELSE (
        SELECT id
        FROM subscription_tiers
        WHERE stripe_product_id = ${productId})
      END
    `,
      // Only reset if all of:
      // - the workspace is on the free tier
      // - the update is not a cancellation
      // - the webhook event contains actual tier change
      ...(currentTier === "free" ? { resetTime: sql`now()` } : {}),
    })
    .where(eq(workspaces.id, workspaceId))
    .returning({ tierId: workspaces.tierId });

  if (workspace && currentTier === "free") {
    await db
      .insert(workspaceUsage)
      .values({
        workspaceId: workspace.id,
        bytes: 0,
        signalSteps: 0,
        lastReportedDate: sql`date_trunc('day', now())`,
      })
      .onConflictDoUpdate({
        target: workspaceUsage.workspaceId,
        set: {
          bytes: 0,
          signalSteps: 0,
          lastReportedDate: sql`date_trunc('day', now())`,
        },
      });
  }

  if (cancel) {
    await db.delete(workspaceUsage).where(eq(workspaceUsage.workspaceId, workspaceId));
  }
  await updateUsageCacheForWorkspace(workspaceId, true, true);
  if (updatedRows.length === 0) {
    return;
  }
  const newTierId = updatedRows[0].tierId;
  try {
    const newTier = await db.query.subscriptionTiers.findFirst({
      where: eq(subscriptionTiers.id, newTierId),
    });
    const newTierName = newTier?.name?.toLowerCase()?.trim();
    const newPaidTier = ["hobby", "pro"].includes(newTierName ?? "") ? (newTierName as PaidTier) : undefined;
    const currentPaidTier = ["hobby", "pro"].includes(currentTier ?? "") ? (currentTier as PaidTier) : undefined;
    const currentTierConfig = currentPaidTier ? TIER_CONFIG[currentPaidTier] : undefined;
    // Run limit and Hobby-overage-warning cleanup on every tier transition so that
    // cancellations (Hobby → Free) also clear Hobby-specific defaults. Otherwise a
    // later upgrade to Pro would inherit them.
    await upsertDefaultTierUsageLimits({
      workspaceId,
      newTierName: newPaidTier,
      newTierConfig: newPaidTier ? TIER_CONFIG[newPaidTier] : undefined,
      currentTierName: currentPaidTier,
      currentTierConfig,
    });
    if (currentPaidTier === "hobby" && newPaidTier !== "hobby") {
      await clearHobbyOverageWarnings(workspaceId);
    }
    if (newPaidTier) {
      await insertNewTierUsageWarnings({
        workspaceId,
        newTierName: newPaidTier,
        newTierConfig: TIER_CONFIG[newPaidTier],
        currentTierConfig,
      });
    }
    await Promise.all([
      invalidateUsageWarningsCacheForWorkspace(workspaceId),
      invalidateProjectCacheForWorkspace(workspaceId),
    ]);
  } catch (e) {
    console.error(`Failed to sync usage warnings/limits for workspace ${workspaceId}, Error: ${e}`);
  }
};

export const getIdFromStripeObject = (stripeObject: string | { id: string } | null): string | undefined => {
  if (typeof stripeObject === "string") {
    return stripeObject;
  }
  return stripeObject?.id;
};

// This function updates the cache used on the backend,
// but since Stripe as a feature assumes production, we assume
// shared Redis cache as well.
const updateUsageCacheForWorkspace = async (workspaceId: string, hasBytes: boolean, hasSignalRuns: boolean) => {
  if (hasBytes) {
    await cache.remove(`${WORKSPACE_BYTES_USAGE_CACHE_KEY}:${workspaceId}`);
  }
  if (hasSignalRuns) {
    await cache.remove(`${WORKSPACE_SIGNAL_STEPS_USAGE_CACHE_KEY}:${workspaceId}`);
  }
  await deleteAllProjectsWorkspaceInfoFromCache(workspaceId);
};

type SubscriptionEvent =
  | Stripe.CustomerSubscriptionUpdatedEvent
  | Stripe.CustomerSubscriptionDeletedEvent
  | Stripe.CustomerSubscriptionCreatedEvent;

export const handleSubscriptionChange = async (event: SubscriptionEvent, cancel: boolean = false) => {
  const subscription = event.data.object;
  const status = subscription.status;
  if (["past_due", "unpaid", "paused"].includes(status)) {
    // https://docs.stripe.com/customer-management/integrate-customer-portal#webhooks
    // this does not include `canceled` status, because if `cancel_at_period_end` is set,
    // the subscription will not be canceled immediately and the `deleted` event will be sent eventually.
    console.log(`Subscription ${subscription.id} status changed to`, status);
    return;
  }
  // A tier switch is performed in two separate Stripe update calls, so this handler may fire
  // in an intermediate state (e.g. old flat price + new metered items). Only use non-metered
  // items for tier resolution: metered overage prices are on different products that have no
  // entry in subscription_tiers and would corrupt the tierId lookup.
  const flatItems = subscription.items.data
    .filter((item) => item.price.recurring?.usage_type !== "metered")
    .filter((item) => item.price.lookup_key !== DATAPLANE_ADDON_LOOKUP_KEY)
    .filter((item) => item.deleted === undefined);
  const tierItems = flatItems.length > 0 ? flatItems : subscription.items.data;

  for (const subscriptionItem of tierItems) {
    if (!subscriptionItem.plan.product) {
      console.log(`subscription updated event. No product found. subscriptionItem: ${subscriptionItem}`);
      continue;
    }
    const stripeCustomerId = getIdFromStripeObject(subscription.customer);
    const productId = getIdFromStripeObject(subscriptionItem.plan.product);
    const workspaceId = subscription.metadata?.workspaceId;

    if (!stripeCustomerId) {
      console.log(`subscription updated event. No stripeCustomerId found.`);
      continue;
    }
    if (!productId) {
      console.log(`subscription updated event. No productId found.`);
      continue;
    }
    if (cancel) {
      console.log(`Subscription ${subscription.id} canceled. productId`, productId);
      if (!workspaceId) {
        console.log(`subscription updated event. No workspaceId found. subscriptionId: ${subscription.id}`);
        continue;
      }
      await manageWorkspaceSubscriptionEvent({
        stripeCustomerId,
        productId,
        workspaceId,
        subscriptionId: subscription.id,
        cancel: true,
      });
      return;
    }

    if (status === "active" && stripeCustomerId && productId) {
      console.log(`Subscription ${subscription.id} active. productId`, productId);
      try {
        if (!workspaceId) {
          console.log(`subscription updated event. No workspaceId found. subscriptionId: ${subscription.id}`);
          continue;
        }
        await manageWorkspaceSubscriptionEvent({
          stripeCustomerId,
          productId,
          workspaceId,
          subscriptionId: subscription.id,
        });
      } catch (error) {
        console.error(`Error managing subscription event`, error);
        throw error;
      }
    }
  }

  const workspaceId = subscription.metadata?.workspaceId;
  if (workspaceId) {
    const hasDataplaneAddon = subscription.items.data.some(
      (item) => item.price.lookup_key === DATAPLANE_ADDON_LOOKUP_KEY
    );
    if (!cancel && status === "active") {
      if (hasDataplaneAddon) {
        await db
          .insert(workspaceAddons)
          .values({
            workspaceId,
            addonSlug: "data-plane",
          })
          .onConflictDoNothing();
        console.log(`Data plane addon added to workspace ${workspaceId}`);
      } else {
        await db
          .delete(workspaceAddons)
          .where(and(eq(workspaceAddons.workspaceId, workspaceId), eq(workspaceAddons.addonSlug, "data-plane")));
      }
    } else if (cancel) {
      await db
        .delete(workspaceAddons)
        .where(and(eq(workspaceAddons.workspaceId, workspaceId), eq(workspaceAddons.addonSlug, "data-plane")));
      console.log(`Data plane addon removed from workspace ${workspaceId} due to cancellation`);
    }
  }
};

export const handleInvoiceFinalized = async (
  workspaceId: string,
  hasBytes: boolean,
  hasSignalRuns: boolean,
  newStartTime: Date | null
) => {
  const resetDateRaw = newStartTime ? newStartTime.toISOString() : sql`now()`;
  const resetDate = sql`${resetDateRaw}::timestamptz`;
  await db
    .insert(workspaceUsage)
    .values({
      workspaceId: workspaceId,
      bytes: 0,
      signalSteps: 0,
      lastReportedDate: sql`date_trunc('day', ${resetDate})`,
    })
    .onConflictDoUpdate({
      target: workspaceUsage.workspaceId,
      set: {
        lastReportedDate: sql`date_trunc('day', ${resetDate})`,
        ...(hasBytes ? { bytes: 0 } : {}),
        ...(hasSignalRuns ? { signalSteps: 0 } : {}),
      },
    });
  await db
    .update(workspaces)
    .set({ resetTime: sql`date_trunc('day', ${resetDate})` })
    .where(eq(workspaces.id, workspaceId));
  await updateUsageCacheForWorkspace(workspaceId, hasBytes, hasSignalRuns);
};

// Extra overage warnings fired on Hobby only, above the included allowance, so users
// accumulating a large overage bill are nudged before it grows further.
const HOBBY_OVERAGE_WARNING_SIGNAL_STEPS = 15_000;
const HOBBY_OVERAGE_WARNING_BYTES = 40 * 1024 ** 3; // 40 GiB

const insertNewTierUsageWarnings = async ({
  workspaceId,
  newTierName,
  newTierConfig,
  currentTierConfig,
}: {
  workspaceId: string;
  newTierName: PaidTier;
  newTierConfig: TierConfigEntry;
  currentTierConfig?: TierConfigEntry;
}) => {
  if (currentTierConfig) {
    await db
      .delete(workspaceUsageWarnings)
      .where(
        and(
          eq(workspaceUsageWarnings.workspaceId, workspaceId),
          eq(workspaceUsageWarnings.usageItem, "bytes"),
          eq(workspaceUsageWarnings.limitValue, currentTierConfig.includedBytes)
        )
      );
    await db
      .delete(workspaceUsageWarnings)
      .where(
        and(
          eq(workspaceUsageWarnings.workspaceId, workspaceId),
          eq(workspaceUsageWarnings.usageItem, "signal_steps_processed"),
          eq(workspaceUsageWarnings.limitValue, currentTierConfig.includedSignalSteps)
        )
      );
  }

  const values = [
    {
      workspaceId,
      usageItem: "bytes",
      limitValue: newTierConfig.includedBytes,
    },
    {
      workspaceId,
      usageItem: "signal_steps_processed",
      limitValue: newTierConfig.includedSignalSteps,
    },
  ];
  if (newTierName === "hobby") {
    values.push(
      {
        workspaceId,
        usageItem: "signal_steps_processed",
        limitValue: HOBBY_OVERAGE_WARNING_SIGNAL_STEPS,
      },
      {
        workspaceId,
        usageItem: "bytes",
        limitValue: HOBBY_OVERAGE_WARNING_BYTES,
      }
    );
  }

  await db.insert(workspaceUsageWarnings).values(values).onConflictDoNothing();
};

// Clear the Hobby-only overage warning rows when a workspace transitions out of Hobby.
// Matched on exact default values so user-adjusted thresholds are preserved.
const clearHobbyOverageWarnings = async (workspaceId: string) => {
  await db
    .delete(workspaceUsageWarnings)
    .where(
      and(
        eq(workspaceUsageWarnings.workspaceId, workspaceId),
        eq(workspaceUsageWarnings.usageItem, "signal_steps_processed"),
        eq(workspaceUsageWarnings.limitValue, HOBBY_OVERAGE_WARNING_SIGNAL_STEPS)
      )
    );
  await db
    .delete(workspaceUsageWarnings)
    .where(
      and(
        eq(workspaceUsageWarnings.workspaceId, workspaceId),
        eq(workspaceUsageWarnings.usageItem, "bytes"),
        eq(workspaceUsageWarnings.limitValue, HOBBY_OVERAGE_WARNING_BYTES)
      )
    );
};

// Hobby gets a default hard cap on signal steps processed so cheaper-than-Pro customers
// don't silently accrue overage charges; Pro intentionally has no default cap. `newTierName`
// is undefined when the workspace moves to Free (cancellation), which must still trigger the
// Hobby cleanup — otherwise a canceled Hobby leaves a 5,000-step row that would silently re-apply
// on a future paid-tier upgrade.
const upsertDefaultTierUsageLimits = async ({
  workspaceId,
  newTierName,
  newTierConfig,
  currentTierName,
  currentTierConfig,
}: {
  workspaceId: string;
  newTierName?: PaidTier;
  newTierConfig?: TierConfigEntry;
  currentTierName?: PaidTier;
  currentTierConfig?: TierConfigEntry;
}) => {
  // Preserve user overrides: only clear the default when it still matches the Hobby default.
  if (currentTierName === "hobby" && newTierName !== "hobby" && currentTierConfig) {
    await db
      .delete(workspaceUsageLimits)
      .where(
        and(
          eq(workspaceUsageLimits.workspaceId, workspaceId),
          eq(workspaceUsageLimits.limitType, "signal_steps_processed"),
          eq(workspaceUsageLimits.limitValue, currentTierConfig.includedSignalSteps)
        )
      );
  }

  if (newTierName === "hobby" && newTierConfig) {
    await db
      .insert(workspaceUsageLimits)
      .values({
        workspaceId,
        limitType: "signal_steps_processed",
        limitValue: newTierConfig.includedSignalSteps,
      })
      .onConflictDoNothing({ target: [workspaceUsageLimits.workspaceId, workspaceUsageLimits.limitType] });
  }
};
