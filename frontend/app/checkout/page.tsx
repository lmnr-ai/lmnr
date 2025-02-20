import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';

import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { users, userSubscriptionInfo } from '@/lib/db/migrations/schema';
import { eq } from 'drizzle-orm';
import { getUserSubscriptionInfo } from '@/lib/checkout/utils';

export default async function CheckoutPage(
  props: {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
  }
) {
  const searchParams = await props.searchParams;
  const lookupKey =
    (searchParams?.lookupKey as string) ?? 'pro_monthly_2025_02';
  const workspaceId = searchParams?.workspaceId as string;
  const workspaceName = searchParams?.workspaceName as string;
  const userSession = await getServerSession(authOptions);
  if (!userSession) {
    redirect(`/sign-in?callbackUrl=/workspace/${workspaceId}`);
  }

  const existingStripeCustomer = await getUserSubscriptionInfo(userSession.user.email!);

  if (
    existingStripeCustomer?.stripeCustomerId &&
    existingStripeCustomer?.activated
  ) {
    redirect('/checkout/portal');
  }

  const s = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const customerId =
    existingStripeCustomer?.stripeCustomerId ??
    (
      await s.customers.create({
        email: userSession.user.email!
      })
    ).id;

  const userId = existingStripeCustomer?.userId ??
    (await db.query.users.findFirst({
      where: eq(users.email, userSession.user.email!)
    }))?.id;

  if (!userId) {
    redirect(`/workspace/${workspaceId}`);
  }

  if (!existingStripeCustomer?.stripeCustomerId) {
    // update the user's stripe customer id to then be able to manage their subscription
    await db.insert(userSubscriptionInfo).values({
      userId,
      stripeCustomerId: customerId,
    }).onConflictDoUpdate({
      target: userSubscriptionInfo.userId,
      set: {
        stripeCustomerId: customerId
      }
    });
  }

  const prices = await s.prices.list({
    lookup_keys: [lookupKey],
    expand: ['data.product']
  });

  const session = await s.checkout.sessions.create({
    customer: customerId,
    line_items: [
      {
        price: prices.data.find((p) => p.lookup_key === lookupKey)?.id,
        quantity: 1
      }
    ],
    mode: 'subscription',
    subscription_data: {
      metadata: {
        workspaceId: workspaceId,
        workspaceName: workspaceName
      }
    },

    success_url: `${process.env.NEXT_PUBLIC_URL}/workspace/${workspaceId}?sessionId={CHECKOUT_SESSION_ID}&workspaceName=${workspaceName}&lookupKey=${lookupKey}`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/workspace/${workspaceId}`,
    allow_promotion_codes: true
  });

  return redirect(session.url!);
}
