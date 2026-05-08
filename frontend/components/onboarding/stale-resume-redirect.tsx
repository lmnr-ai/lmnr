"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Bridge for the case where the onboarding cookie's workspace/project were
// deleted out from under the user but the cookie is still alive. Clearing
// from the Server Component then redirecting can loop through the
// (authenticated) gate (see CLAUDE.md), so we DELETE via the route handler
// from the client and then navigate.
export default function StaleResumeRedirect({ destination }: { destination: string }) {
  const router = useRouter();
  useEffect(() => {
    void (async () => {
      try {
        await fetch("/api/onboarding/state", { method: "DELETE" });
      } catch {
        // Cookie will expire on its own; continue to destination either way.
      }
      router.replace(destination);
    })();
  }, [router, destination]);
  return null;
}
