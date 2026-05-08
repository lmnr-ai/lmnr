import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { type ReactNode } from "react";

import { getOnboardingState } from "@/lib/actions/onboarding";
import { authOptions } from "@/lib/auth";

// Shared gate for every authenticated app route tree. Two responsibilities:
//   1. Require a session (replaces the proxy's withAuth redirect for these
//      pages, so we don't need to import next-auth/middleware globally).
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
  if (saved) {
    return redirect("/onboarding");
  }

  return <>{children}</>;
}
