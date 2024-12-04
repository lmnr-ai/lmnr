import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';

import { authOptions } from '@/lib/auth';
import { UserSubscriptionInfo } from '@/lib/checkout/types';
import { fetcher, fetcherJSON } from '@/lib/utils';

export default async function CheckoutPage({
  searchParams
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const lookupKey =
    (searchParams?.lookupKey as string) ?? 'pro_monthly_2024_09';
  const workspaceId = searchParams?.workspaceId as string;
  const workspaceName = searchParams?.workspaceName as string;
  const userSession = await getServerSession(authOptions);
  if (!userSession) {
    redirect(`/sign-in?callbackUrl=/workspace/${workspaceId}`);
  }

  const existingStripeCustomer = (await fetcherJSON('/subscriptions', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userSession.user.apiKey}`
    }
  })) as UserSubscriptionInfo | null;

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

  if (!existingStripeCustomer?.stripeCustomerId) {
    // update the user's stripe customer id to then be able to manage their subscription
    await fetcher('/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userSession?.user.apiKey}`
      },
      body: JSON.stringify({
        stripeCustomerId: customerId
      })
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
