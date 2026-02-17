import { eq } from "drizzle-orm";
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Stripe from "stripe";

import { authOptions } from "@/lib/auth";
import { getUserSubscriptionInfo, type PaidTier, TIER_CONFIG } from "@/lib/checkout/utils";
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

  // Resolve the tier config from the lookup key to get the matching overage price keys
  const tierEntry = Object.entries(TIER_CONFIG).find(([, config]) => config.lookupKey === lookupKey);
  const tier = tierEntry ? (tierEntry[0] as PaidTier) : null;
  const tierConfig = tier ? TIER_CONFIG[tier] : null;

  // Fetch all prices in one call: the flat price + both overage prices
  const allLookupKeys = [
    lookupKey,
    ...(tierConfig ? [tierConfig.overageBytesLookupKey, tierConfig.overageSignalRunsLookupKey] : []),
  ];

  const prices = await s.prices.list({
    lookup_keys: allLookupKeys,
  });

  const flatPrice = prices.data.find((p) => p.lookup_key === lookupKey);
  const bytesOveragePrice = tierConfig
    ? prices.data.find((p) => p.lookup_key === tierConfig.overageBytesLookupKey)
    : undefined;
  const signalRunsOveragePrice = tierConfig
    ? prices.data.find((p) => p.lookup_key === tierConfig.overageSignalRunsLookupKey)
    : undefined;

  const subscriptionMetadata = {
    workspaceId: workspaceId!,
    workspaceName: workspaceName!,
    type: "workspace",
  };

  const urlEncodedWorkspaceName = encodeURIComponent(workspaceName ?? "");

  const successUrl = `${process.env.NEXT_PUBLIC_URL}/workspace/${workspaceId}?sessionId={CHECKOUT_SESSION_ID}&workspaceName=${urlEncodedWorkspaceName}&lookupKey=${lookupKey}`;

  const cancelUrl = `${process.env.NEXT_PUBLIC_URL}/workspace/${workspaceId}`;

  const session = await s.checkout.sessions.create({
    customer: customerId,
    line_items: [
      {
        price: flatPrice?.id,
        quantity: 1,
      },
      ...(bytesOveragePrice ? [{ price: bytesOveragePrice.id }] : []),
      ...(signalRunsOveragePrice ? [{ price: signalRunsOveragePrice.id }] : []),
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
