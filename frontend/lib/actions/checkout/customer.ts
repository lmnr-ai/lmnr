import { eq } from "drizzle-orm";

import { stripe } from "@/lib/actions/checkout/stripe";
import { getUserSubscriptionInfo } from "@/lib/actions/checkout/webhook";
import { db } from "@/lib/db/drizzle";
import { users, userSubscriptionInfo } from "@/lib/db/migrations/schema";

// Stripe customers are per user (user_subscription_info), created lazily on the first checkout or trial.
export const getOrCreateStripeCustomer = async (email: string): Promise<{ customerId: string; userId?: string }> => {
  const existing = await getUserSubscriptionInfo(email);
  if (existing?.stripeCustomerId) {
    return { customerId: existing.stripeCustomerId, userId: existing.userId };
  }

  const customerId = (await stripe().customers.create({ email })).id;
  const userId = existing?.userId ?? (await db.query.users.findFirst({ where: eq(users.email, email) }))?.id;

  if (userId) {
    await db
      .insert(userSubscriptionInfo)
      .values({ userId, stripeCustomerId: customerId })
      .onConflictDoUpdate({ target: userSubscriptionInfo.userId, set: { stripeCustomerId: customerId } });
  }

  return { customerId, userId };
};
