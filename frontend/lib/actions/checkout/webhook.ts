import { and, eq, sql } from "drizzle-orm";
import { type Stripe } from "stripe";

import { deleteAllProjectsWorkspaceInfoFromCache } from "@/lib/actions/project";
import { cache, WORKSPACE_BYTES_USAGE_CACHE_KEY, WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY } from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import { users, userSubscriptionInfo, workspaceAddons, workspaces } from "@/lib/db/migrations/schema";

import { DATAPLANE_ADDON_LOOKUP_KEY } from "./types";

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

  await db
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
    })
    .where(eq(workspaces.id, workspaceId));

  await updateUsageCacheForWorkspace(workspaceId);
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
const updateUsageCacheForWorkspace = async (workspaceId: string) => {
  await deleteAllProjectsWorkspaceInfoFromCache(workspaceId);
  await cache.remove(`${WORKSPACE_BYTES_USAGE_CACHE_KEY}:${workspaceId}`);
  await cache.remove(`${WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY}:${workspaceId}`);
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
  for (const subscriptionItem of subscription.items.data) {
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

export const handleInvoiceFinalized = async (workspaceId: string, periodStart: number) => {
  await db
    .update(workspaces)
    .set({ resetTime: new Date(periodStart * 1000).toISOString() })
    .where(eq(workspaces.id, workspaceId));

  await cache.remove(`${WORKSPACE_BYTES_USAGE_CACHE_KEY}:${workspaceId}`);
  await cache.remove(`${WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY}:${workspaceId}`);
  await deleteAllProjectsWorkspaceInfoFromCache(workspaceId);
  console.log(
    `Billing cycle reset for workspace ${workspaceId}, new period start: ${new Date(periodStart * 1000).toISOString()}`
  );
};
