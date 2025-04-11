import { eq, sql } from 'drizzle-orm';

import { cache } from '../cache';
import { db } from '../db/drizzle';
import { subscriptionTiers, users, userSubscriptionInfo, userUsage, workspaces, workspaceUsage } from '../db/migrations/schema';

// This cache key MUST match the key in the app-server
const WORKSPACE_LIMITS_CACHE_KEY = "workspace_limits";

export const LOOKUP_KEY_TO_TIER_NAME: Record<string, string> = {
  hobby_monthly_2025_04: 'Laminar Hobby tier',
  pro_monthly_2025_02: 'Laminar Pro tier',
  pro_monthly_2025_04: 'Laminar Pro tier',
  additional_seat_2024_11: 'Additional seat',
  index_pro_monthly_2025_04: 'Laminar Index Pro tier'
};

export function isLookupKeyForAdditionalSeats(lookupKey: string | null): boolean {
  return lookupKey?.startsWith('additional_seat') ?? false;
}

export interface ItemDescription {
  productDescription: string;
  shortDescription?: string;
  quantity?: number;
}


interface ManageWorkspaceSubscriptionEventArgs {
  stripeCustomerId: string;
  productId: string;
  workspaceId: string;
  subscriptionId: string;
  quantity?: number;
  cancel?: boolean;
  isAdditionalSeats?: boolean;
}

interface ManageUserSubscriptionEventArgs {
  stripeCustomerId: string;
  productId: string;
  userId: string;
  subscriptionId: string;
  cancel?: boolean;
}

export async function getUserSubscriptionInfo(email: string):
  Promise<typeof userSubscriptionInfo.$inferSelect | undefined> {
  const existingStripeCustomers = await db.select()
    .from(userSubscriptionInfo)
    .innerJoin(users, eq(userSubscriptionInfo.userId, users.id))
    .where(eq(users.email, email));

  return existingStripeCustomers.length > 0
    ? existingStripeCustomers[0].user_subscription_info
    : undefined;
}

export const manageWorkspaceSubscriptionEvent = async ({
  stripeCustomerId,
  productId,
  subscriptionId,
  workspaceId,
  quantity,
  cancel,
  isAdditionalSeats
}: ManageWorkspaceSubscriptionEventArgs) => {
  const newQuantity = quantity ?? 0;

  // Activate the stripe customer
  await db.update(userSubscriptionInfo).set({
    stripeCustomerId,
    activated: true
  }).where(eq(userSubscriptionInfo.stripeCustomerId, stripeCustomerId));

  // Add additional seats to the workspace
  if (isAdditionalSeats && newQuantity > 0) {
    await db.update(workspaces).set({
      additionalSeats: newQuantity
    }).where(eq(workspaces.id, workspaceId));
  } else {
    // Update the subscription
    await db.update(workspaces).set({
      subscriptionId,
      tierId: sql`CASE
        WHEN ${cancel ?? false} THEN 1 
        ELSE (
          SELECT id
          FROM subscription_tiers
          WHERE stripe_product_id = ${productId})
        END
      `
    }).where(eq(workspaces.id, workspaceId));
  }


  const currentTier = (await db.select({
    tierId: workspaces.tierId
  }).from(workspaces).where(eq(workspaces.id, workspaceId)))[0];

  // If the workspace is upgrading from the free tier, reset the usage
  if (currentTier.tierId === 1) {
    await db.update(workspaceUsage).set({
      prevSpanCount: workspaceUsage.spanCount,
      spanCountSinceReset: 0,
      resetTime: sql`now()`,
      resetReason: 'subscription_change'
    }).where(eq(workspaceUsage.workspaceId, workspaceId));
  }

  await updateUsageCacheForWorkspace(workspaceId);
};

export const manageUserSubscriptionEvent = async ({
  stripeCustomerId,
  productId,
  subscriptionId,
  userId,
  cancel,
}: ManageUserSubscriptionEventArgs) => {
  // Activate the stripe customer
  await db.update(userSubscriptionInfo).set({
    stripeCustomerId,
    activated: true
  }).where(eq(userSubscriptionInfo.stripeCustomerId, stripeCustomerId));
  console.log(productId);

  await db.update(users).set({
    tierId: sql`CASE
      WHEN ${cancel ?? false} THEN 1 
      ELSE (
        SELECT id
        FROM user_subscription_tiers
        WHERE stripe_product_id = ${productId})
      END
    `
  }).where(eq(users.id, userId));


  const currentTier = (await db.select({
    tierId: users.tierId
  }).from(users).where(eq(users.id, userId)))?.[0];

  // If the workspace is upgrading from the free tier, reset the usage
  if (currentTier?.tierId === 1) {
    await db.update(userUsage).set({
      prevIndexChatMessageCount: userUsage.indexChatMessageCount,
      indexChatMessageCountSinceReset: 0,
      resetTime: sql`now()`,
      resetReason: 'subscription_change'
    }).where(eq(userUsage.userId, userId));
  }
};

export const getIdFromStripeObject = (
  stripeObject: string | { id: string } | null
): string | undefined => {
  if (typeof stripeObject === 'string') {
    return stripeObject;
  }
  return stripeObject?.id;
};


// This function updates the cache that is used on the backend,
// but since Stripe as a feature assumes production, we assume
// shared Redis cache as well.
//
// Worst case scenario if the cache fails,
// is that the workspace will upgrade but the spans will still be rejected
// based on the cached value. Bad, but not critical.
const updateUsageCacheForWorkspace = async (workspaceId: string) => {
  const cacheKey = `${WORKSPACE_LIMITS_CACHE_KEY}:${workspaceId}`;
  const baseQuery = db.$with('workspace_stats').as(
    db.select({
      tierName: subscriptionTiers.name,
      spansLimit: subscriptionTiers.spans,
      stepsLimit: subscriptionTiers.steps,
      spansThisMonth: workspaceUsage.spanCount,
      stepsThisMonth: workspaceUsage.stepCount
    }).from(workspaces)
      .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
      .innerJoin(workspaceUsage, eq(workspaces.id, workspaceUsage.workspaceId))
      .where(eq(workspaces.id, workspaceId))
  );

  const limitExceededRows = await db.with(baseQuery).select({
    spans: sql`span_count >= spans AND LOWER(TRIM(name)) = 'free'`,
    steps: sql`step_count >= steps AND LOWER(TRIM(name)) = 'free'`
  }).from(baseQuery);

  const limitExceeded = {
    spans: limitExceededRows.length > 0 && !!limitExceededRows[0].spans,
    steps: limitExceededRows.length > 0 && !!limitExceededRows[0].steps
  };

  await cache.set(cacheKey, limitExceeded);
};
