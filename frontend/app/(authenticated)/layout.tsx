import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { type ReactNode } from "react";

import { getOnboardingState } from "@/lib/actions/onboarding";
import { authOptions } from "@/lib/auth";

// Shared gate for every authenticated app route tree. Two responsibilities:
//   1. Require a session. In practice `withAuth` in proxy.ts already redirects
//      unauthenticated requests to `/sign-in?callbackUrl=<path>` for these
//      routes (see the matcher there), so this branch is a belt-and-suspenders
//      fallback. It can't construct a callbackUrl here because Server
//      Component layouts don't receive the request pathname — all the more
//      reason the middleware is the right owner of this redirect.
//   2. If an onboarding cookie is present, force the user back to /onboarding
//      until they finish (or the cookie expires). This replaces the old
//      proxy-level matcher hack — onboarding logic now lives entirely under
//      the onboarding feature folder + this single layout call.
//
// Per-route layouts (project, workspace, etc.) keep their own access checks;
// this layout is concerned only with the cross-cutting auth + onboarding gate.
export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return redirect("/sign-in");
  }

  const saved = await getOnboardingState();
  // Only bounce to /onboarding when the cookie belongs to the current session.
  // A stale cookie from another user on the same device would otherwise force
  // user B into the wizard — and because the page-level `!saved` guard is
  // tripped by any truthy cookie, they'd land on an empty step-0 wizard
  // instead of their existing /projects.
  if (saved && saved.userId === session.user.id) {
    return redirect("/onboarding");
  }

  return <>{children}</>;
}
