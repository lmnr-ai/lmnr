import { type NextRequest } from "next/server";

import { clearOnboardingState } from "@/lib/actions/onboarding";
import { getServerSession } from "@/lib/auth-session";
import { relativeRedirect } from "@/lib/relative-redirect";

const SAFE_DESTINATIONS = new Set(["/projects", "/sign-in"]);

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return relativeRedirect("/sign-in");
  }
  await clearOnboardingState();
  const to = request.nextUrl.searchParams.get("to") ?? "/projects";
  const destination = SAFE_DESTINATIONS.has(to) ? to : "/projects";
  return relativeRedirect(destination);
}
