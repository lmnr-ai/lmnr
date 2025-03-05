import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';

import { authOptions } from '@/lib/auth';
import { getUserSubscriptionInfo } from '@/lib/checkout/utils';

export default async function CheckoutPortalPage(
  props: {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
  }
) {
  const searchParams = await props.searchParams;
  const userSession = await getServerSession(authOptions);
  if (!userSession) {
    redirect('/sign-in?callbackUrl=/checkout/portal');
  }
  const s = new Stripe(process.env.STRIPE_SECRET_KEY!);

  let stripeCustomerId;

  if (searchParams?.sessionId) {
    // sessionId is prefilled from stripe checkout success page
    const session = await s.checkout.sessions.retrieve(
      searchParams?.sessionId as string
    );
    stripeCustomerId = session.customer as string;
  } else {
    const existingStripeCustomer = await getUserSubscriptionInfo(userSession.user.email!);
    stripeCustomerId = existingStripeCustomer?.activated
      ? existingStripeCustomer?.stripeCustomerId
      : null;
  }

  if (!stripeCustomerId) {
    // fallback to log in by email, if we could not find the customer
    redirect(
      'https://billing.stripe.com/p/login/14keVz71QekEc0g144?' +
      'prefilled_email=' +
      userSession.user.email
    );
  } else {
    const returnUrl =
      process.env.NEXT_PUBLIC_URL! + (searchParams?.callbackUrl ?? '/projects');
    const portalSession = await s.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl
    });
    redirect(portalSession.url!);
  }
}
