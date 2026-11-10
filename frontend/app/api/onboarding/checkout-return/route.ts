import { type NextRequest, NextResponse } from "next/server";

import { completeOnboardingCheckout } from "@/lib/actions/onboarding/commit";
import { withBasePath } from "@/lib/utils";

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
  return NextResponse.redirect(new URL(withBasePath("/onboarding"), request.url));
}
