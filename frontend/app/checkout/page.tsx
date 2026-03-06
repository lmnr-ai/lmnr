import { eq } from "drizzle-orm";
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Stripe from "stripe";

import { TIER_CONFIG } from "@/lib/actions/checkout/types";
import { getUserSubscriptionInfo } from "@/lib/actions/checkout/webhook";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { users, userSubscriptionInfo } from "@/lib/db/migrations/schema";

export const metadata: Metadata = {
  title: "Checkout - Laminar",
  description: "Complete your Laminar subscription.",
};

export default async function CheckoutPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const lookupKey = (searchParams?.lookupKey as string) ?? TIER_CONFIG.hobby.lookupKey;
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
    existingStripeCustomer?.stripeCustomerId ||
    (
      await s.customers.create({
        email: userSession!.user.email!,
      })
    ).id;

  const userId =
    existingStripeCustomer?.userId ??
    (
      await db.query.users.findFirst({
        where: eq(users.email, userSession!.user.email!),
      })
    )?.id;

  if (!userId) {
    redirect(`/workspace/${workspaceId}`);
  }

  if (!existingStripeCustomer?.stripeCustomerId) {
    await db
      .insert(userSubscriptionInfo)
      .values({
        userId,
        stripeCustomerId: customerId,
      })
      .onConflictDoUpdate({
        target: userSubscriptionInfo.userId,
        set: {
          stripeCustomerId: customerId,
        },
      });
  }

  const successUrl = `${process.env.NEXT_PUBLIC_URL}/workspace/${workspaceId}?sessionId={CHECKOUT_SESSION_ID}&tab=billing`;
  const cancelUrl = `${process.env.NEXT_PUBLIC_URL}/workspace/${workspaceId}?tab=billing`;

  // Only send the flat plan price to checkout – overage prices are added
  // server-side in the subscription.created webhook to avoid confusing
  // line-item display on the Stripe checkout page.
  const prices = await s.prices.list({
    lookup_keys: [lookupKey],
  });

  const flatPrice = prices.data.find((p) => p.lookup_key === lookupKey);

  const subscriptionMetadata = {
    workspaceId: workspaceId!,
    workspaceName: workspaceName!,
    type: "workspace",
  };

  const session = await s.checkout.sessions.create({
    customer: customerId,
    line_items: [
      {
        price: flatPrice?.id,
        quantity: 1,
      },
    ],
    mode: "subscription",
    subscription_data: {
      metadata: subscriptionMetadata,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  });

  redirect(session.url!);
}
