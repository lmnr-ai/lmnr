import { stripe } from "@/lib/actions/checkout/stripe";
import { getIdFromStripeObject, manageWorkspaceSubscriptionEvent } from "@/lib/actions/checkout/webhook";
import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";

// Applies a completed Checkout session right away instead of waiting for the webhook, so the
// onboarding return can rely on the paid tier. Idempotent with the webhook.
export const confirmCheckoutSession = async ({
  sessionId,
  workspaceId,
}: {
  sessionId: string;
  workspaceId: string;
}): Promise<boolean> => {
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });

  const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  const subscription = typeof session.subscription === "object" ? session.subscription : null;
  if (session.status !== "complete" || !subscription || subscription.metadata?.workspaceId !== workspaceId) {
    return false;
  }
  if (!["active", "trialing"].includes(subscription.status)) return false;

  const flatItem = subscription.items.data.find((item) => item.price.recurring?.usage_type !== "metered");
  const productId = flatItem ? getIdFromStripeObject(flatItem.price.product as string | { id: string }) : undefined;
  const stripeCustomerId = getIdFromStripeObject(subscription.customer);
  if (!productId || !stripeCustomerId) return false;

  await manageWorkspaceSubscriptionEvent({ stripeCustomerId, productId, workspaceId, subscriptionId: subscription.id });
  return true;
};
