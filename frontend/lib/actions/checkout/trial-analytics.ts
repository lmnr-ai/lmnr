import type Stripe from "stripe";

import PostHogClient from "@/lib/posthog/server";

export type TrialSource = "onboarding" | "billing";

type TrialEvent = "started" | "card_added" | "converted" | "ended";

// Keyed on the workspace id so the webhook needs no lookups; personless so it creates no fake person profiles.
// Fire-and-forget like auth:user_created; analytics failures must never fail the webhook.
export const captureTrialEvent = (
  subscription: Stripe.Subscription,
  event: TrialEvent,
  properties: Record<string, unknown> = {}
): void => {
  const workspaceId = subscription.metadata?.workspaceId;
  if (!workspaceId) return;
  try {
    PostHogClient()?.capture({
      distinctId: workspaceId,
      event: `trial:${event}`,
      properties: {
        workspace_id: workspaceId,
        subscription_id: subscription.id,
        $process_person_profile: false,
        ...properties,
      },
    });
  } catch {
    // Analytics failures must never break billing.
  }
};
