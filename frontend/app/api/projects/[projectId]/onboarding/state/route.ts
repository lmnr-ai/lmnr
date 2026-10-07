import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

import { clearOnboardingState, getOnboardingState, setOnboardingState } from "@/lib/actions/onboarding";
import { ONBOARDING_COOKIE_VERSION } from "@/lib/actions/onboarding/types";
import { getServerSession } from "@/lib/auth-session";
import { db } from "@/lib/db/drizzle";
import { projects } from "@/lib/db/migrations/schema";
import { sendWelcomeEmail } from "@/lib/emails/utils";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

const StateSchema = z.object({
  step: z.number().int().min(0).max(10),
});

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { projectId } = await props.params;
    const { step } = StateSchema.parse(await request.json());

    const [project] = await db
      .select({ workspaceId: projects.workspaceId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const existing = await getOnboardingState();
    const startedAt = existing && existing.userId === session.user.id ? existing.startedAt : Date.now();

    await setOnboardingState({
      v: ONBOARDING_COOKIE_VERSION,
      userId: session.user.id,
      workspaceId: project.workspaceId,
      projectId,
      step,
      startedAt,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save onboarding state" },
      { status: 400 }
    );
  }
}

export async function DELETE() {
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
      await sendWelcomeEmail(session.user.email);
    } catch (e) {
      console.error("Failed to send welcome email:", e);
    }
  }
  return NextResponse.json({ success: true });
}
