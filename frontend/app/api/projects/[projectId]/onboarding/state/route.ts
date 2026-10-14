import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

import { clearOnboardingState, getOnboardingState, setOnboardingState } from "@/lib/actions/onboarding";
import { getServerSession } from "@/lib/auth-session";
import { sendWelcomeEmail } from "@/lib/emails/utils";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

// Only post-commit moves are persisted here; the plan step commits through /api/onboarding/commit.
const StateSchema = z.object({
  step: z.enum(["slack", "connect"]),
});

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { projectId } = await props.params;
    const { step } = StateSchema.parse(await request.json());

    const existing = await getOnboardingState();
    if (!existing || existing.userId !== session.user.id || existing.projectId !== projectId) {
      return NextResponse.json({ error: "No onboarding in progress for this project" }, { status: 404 });
    }
    await setOnboardingState({ ...existing, step });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save onboarding state" },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await clearOnboardingState();
  if (isFeatureEnabled(Feature.SEND_EMAIL) && session.user.email) {
    // Cookie is already cleared; an email failure must NOT propagate to a 500
    // or finishOnboarding (called from both PlanStep free-tier branch and
    // PaidFinalize) would block navigation on `res.ok`.
    try {
      const { projectId } = await props.params;
      await sendWelcomeEmail(session.user.email, projectId);
    } catch (e) {
      console.error("Failed to send welcome email:", e);
    }
  }
  return NextResponse.json({ success: true });
}
