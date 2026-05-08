import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod/v4";

import { clearOnboardingState, getOnboardingState, setOnboardingState } from "@/lib/actions/onboarding";
import { ONBOARDING_COOKIE_VERSION } from "@/lib/actions/onboarding/types";
import { authOptions } from "@/lib/auth";

const StateSchema = z.object({
  workspaceId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  step: z.number().int().min(0).max(10),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const parsed = StateSchema.parse(body);

    // Preserve startedAt across writes so we know when the flow began.
    const existing = await getOnboardingState();
    const startedAt = existing && existing.userId === session.user.id ? existing.startedAt : Date.now();

    await setOnboardingState({
      v: ONBOARDING_COOKIE_VERSION,
      userId: session.user.id,
      workspaceId: parsed.workspaceId,
      projectId: parsed.projectId,
      step: parsed.step,
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
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await clearOnboardingState();
  return NextResponse.json({ success: true });
}
