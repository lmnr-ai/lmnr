import { type NextRequest, NextResponse } from "next/server";

import { clearOnboardingState } from "@/lib/actions/onboarding";
import { getServerSession } from "@/lib/auth-session";

const SAFE_DESTINATIONS = new Set(["/projects", "/sign-in"]);

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  await clearOnboardingState();
  const to = request.nextUrl.searchParams.get("to") ?? "/projects";
  const destination = SAFE_DESTINATIONS.has(to) ? to : "/projects";
  return NextResponse.redirect(new URL(destination, request.url));
}
