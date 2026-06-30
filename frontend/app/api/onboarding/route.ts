import { type NextRequest, NextResponse } from "next/server";

import { clearOnboardingState } from "@/lib/actions/onboarding";
import { getServerSession } from "@/lib/auth-session";
import { withBasePath } from "@/lib/utils";

const SAFE_DESTINATIONS = new Set(["/projects", "/sign-in"]);

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    // NextResponse.redirect does NOT apply basePath, and new URL(path, base)
    // overrides the path entirely (dropping the prefix) — prefix manually.
    return NextResponse.redirect(new URL(withBasePath("/sign-in"), request.url));
  }
  await clearOnboardingState();
  const to = request.nextUrl.searchParams.get("to") ?? "/projects";
  const destination = SAFE_DESTINATIONS.has(to) ? to : "/projects";
  return NextResponse.redirect(new URL(withBasePath(destination), request.url));
}
