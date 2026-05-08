import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod/v4";

import { clearOnboardingState, setOnboardingState } from "@/lib/actions/onboarding";
import { authOptions } from "@/lib/auth";

const StateSchema = z.object({
  workspaceId: z.uuid(),
  projectId: z.uuid(),
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
    await setOnboardingState(parsed);
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
