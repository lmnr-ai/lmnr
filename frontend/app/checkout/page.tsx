import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';

import { authOptions } from '@/lib/auth';
import { getUserSubscriptionInfo } from '@/lib/checkout/utils';
import { db } from '@/lib/db/drizzle';
import { users, userSubscriptionInfo } from '@/lib/db/migrations/schema';

export default async function CheckoutPage(
  props: {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
  }
) {
  const searchParams = await props.searchParams;
  const typeParam = searchParams?.type ?? 'workspace' as 'workspace' | 'user';
  const lookupKey =
    (searchParams?.lookupKey as string) ?? (
      typeParam === 'workspace' ? 'hobby_monthly_2025_04' : 'index_pro_monthly_2025_04'
    );
  const workspaceId = searchParams?.workspaceId as string | undefined;
  const workspaceName = searchParams?.workspaceName as string | undefined;

  const userSession = await getServerSession(authOptions);
  if (!userSession) {
    if (workspaceId) {
      redirect(`/sign-in?callbackUrl=/workspace/${workspaceId}`);
    } else {
      redirect(`/sign-in`);
    }
  }

  const existingStripeCustomer = await getUserSubscriptionInfo(userSession!.user.email!);

  const s = new Stripe(process.env.STRIPE_SECRET_KEY!);

  const customerId =
    existingStripeCustomer?.stripeCustomerId ??
    (
      await s.customers.create({
        email: userSession!.user.email!
      })
    ).id;

  const userId = existingStripeCustomer?.userId ??
    (await db.query.users.findFirst({
      where: eq(users.email, userSession!.user.email!)
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

  const metadata = typeParam === 'workspace' ? {
    workspaceId: workspaceId!,
    workspaceName: workspaceName!,
    userId: userId!,
    type: 'workspace'
  } : {
    userId: userId!,
    workspaceId: null,
    workspaceName: null,
    type: 'user'
  };

  const successUrl = typeParam === 'workspace' ?
    `${process.env.NEXT_PUBLIC_URL}/workspace/${workspaceId}?sessionId={CHECKOUT_SESSION_ID}&workspaceName=${workspaceName}&lookupKey=${lookupKey}` :
    `${process.env.NEXT_PUBLIC_URL}/chat?sessionId={CHECKOUT_SESSION_ID}&userId=${userId}&lookupKey=${lookupKey}`;

  const cancelUrl = typeParam === 'workspace' ?
    `${process.env.NEXT_PUBLIC_URL}/workspace/${workspaceId}` :
    `${process.env.NEXT_PUBLIC_URL}/chat`;

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
      metadata
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  });

  redirect(session.url!);
}
