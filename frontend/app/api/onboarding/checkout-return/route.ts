import { type NextRequest } from "next/server";

import { completeOnboardingCheckout } from "@/lib/actions/onboarding/commit";
import { relativeRedirect } from "@/lib/relative-redirect";

// Stripe success_url for onboarding checkouts: confirm and apply, then resume the wizard.
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (sessionId) {
    try {
      await completeOnboardingCheckout(sessionId);
    } catch (e) {
      // The webhook still applies the plan; the wizard resumes on the Slack step.
      console.error("Failed to complete onboarding checkout", e);
    }
  }
  return relativeRedirect("/onboarding");
}
