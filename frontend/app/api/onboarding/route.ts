import { type NextRequest, NextResponse } from "next/server";

import { clearOnboardingState } from "@/lib/actions/onboarding";
import { getServerSession } from "@/lib/auth-session";
import { withBasePath } from "@/lib/utils";

const SAFE_DESTINATIONS = new Set(["/projects", "/sign-in"]);

// Behind a proxy, route handlers see the server's bind address in request.url (e.g. 0.0.0.0:3000),
// so a relative Location lets the browser resolve it against the origin it is actually on.
const relativeRedirect = (path: string) =>
  new NextResponse(null, { status: 307, headers: { Location: withBasePath(path) } });

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
