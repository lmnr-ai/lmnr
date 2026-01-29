import { eq } from "drizzle-orm";
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Stripe from "stripe";

import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Checkout - Laminar",
  description: "Complete your Laminar subscription.",
};
import { getIdFromStripeObject, getUserSubscriptionInfo } from "@/lib/checkout/utils";
import { db } from "@/lib/db/drizzle";
import { users, userSubscriptionInfo } from "@/lib/db/migrations/schema";

const bytesOverageLookupKeyEnding = "_monthly_2025_06_overage_bytes";
const stepsOverageLookupKeyEnding = "_monthly_2025_06_overage_steps";

export default async function CheckoutPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const typeParam = searchParams?.type ?? ("workspace" as "workspace" | "user");
  const lookupKey =
    (searchParams?.lookupKey as string) ??
    (typeParam === "workspace" ? "hobby_monthly_2025_04" : "index_pro_monthly_2025_04");
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
    // update the user's stripe customer id to then be able to manage their subscription
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

  const prices = await s.prices.list({
    lookup_keys: [lookupKey],
    expand: ["data.product"],
  });

  const product = prices.data[0].product;

  const productPrices = await s.prices.list({
    product: getIdFromStripeObject(product),
  });

  const bytesOveragePrice = productPrices.data.find((p) => p.lookup_key?.endsWith(bytesOverageLookupKeyEnding));
  const stepsOveragePrice = productPrices.data.find((p) => p.lookup_key?.endsWith(stepsOverageLookupKeyEnding));

  const metadata =
    typeParam === "workspace"
      ? {
        workspaceId: workspaceId!,
        workspaceName: workspaceName!,
        userId: userId!,
        type: "workspace",
      }
      : {
        userId: userId!,
        workspaceId: null,
        workspaceName: null,
        type: "user",
      };

  const urlEncodedWorkspaceName = encodeURIComponent(workspaceName ?? "");

  const successUrl = `${process.env.NEXT_PUBLIC_URL}/workspace/${workspaceId}?sessionId={CHECKOUT_SESSION_ID}&workspaceName=${urlEncodedWorkspaceName}&lookupKey=${lookupKey}`;

  const cancelUrl = `${process.env.NEXT_PUBLIC_URL}/workspace/${workspaceId}`;

  const session = await s.checkout.sessions.create({
    customer: customerId,
    line_items: [
      {
        price: prices.data.find((p) => p.lookup_key === lookupKey)?.id,
        quantity: 1,
      },
      ...(bytesOveragePrice
        ? [
          {
            price: bytesOveragePrice?.id,
          },
        ]
        : []),
      ...(stepsOveragePrice
        ? [
          {
            price: stepsOveragePrice?.id,
          },
        ]
        : []),
    ],
    mode: "subscription",
    subscription_data: {
      metadata,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  });

  redirect(session.url!);
}
