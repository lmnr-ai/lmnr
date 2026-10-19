import { type NextRequest, NextResponse } from "next/server";

import { clearOnboardingState, getOnboardingState, setOnboardingState } from "@/lib/actions/onboarding";
import { OnboardingProgressSchema } from "@/lib/actions/onboarding/types";
import { getServerSession } from "@/lib/auth-session";
import { sendWelcomeEmail } from "@/lib/emails/utils";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { projectId } = await props.params;
    const { step, pending } = OnboardingProgressSchema.parse(await request.json());

    const existing = await getOnboardingState();
    if (!existing || existing.userId !== session.user.id || existing.projectId !== projectId) {
      return NextResponse.json({ error: "No onboarding in progress for this project" }, { status: 404 });
    }
    // A trial or paid plan already applied the queued choices; a late save from another tab or a slow
    // request must not move it back to the Slack step, where Continue would apply them again.
    if (existing.step === "connect" && !existing.pending) {
      return NextResponse.json({ error: "The plan is already set up" }, { status: 409 });
    }
    await setOnboardingState({ ...existing, step, pending });
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
  // Repeat DELETEs (other tabs, retries) arrive without the cookie and must not re-send the
  // welcome email. OSS never sets the cookie and calls this only to send the email.
  const saved = await getOnboardingState();
  const isFirstFinish = !isFeatureEnabled(Feature.LAMINAR_CLOUD) || saved?.userId === session.user.id;
  await clearOnboardingState();
  if (isFirstFinish && isFeatureEnabled(Feature.SEND_EMAIL) && session.user.email) {
    // Cookie is already cleared; an email failure must NOT propagate to a 500
    // or finishOnboarding would block navigation on `res.ok`.
    try {
      const { projectId } = await props.params;
      await sendWelcomeEmail(session.user.email, projectId);
    } catch (e) {
      console.error("Failed to send welcome email:", e);
    }
  }
  return NextResponse.json({ success: true });
}
