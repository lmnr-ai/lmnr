"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

// Bridge for the case where the onboarding cookie's workspace/project were
// deleted out from under the user but the cookie is still alive. Clearing
// from the Server Component then redirecting can loop through the
// (authenticated) gate (see CLAUDE.md), so we DELETE via the route handler
// from the client and then navigate.
//
// `fetch` only throws on network errors — a non-2xx response (e.g. 401 during
// a session-edge race, or 500 from the route handler) resolves without
// throwing. If we navigated on those the cookie would still be alive, the
// (authenticated) layout would bounce back to /onboarding, which would render
// this component again — an infinite loop until the cookie expires. So we
// only call router.replace when the DELETE is confirmed successful, and
// surface a retry affordance otherwise.
export default function StaleResumeRedirect({ destination }: { destination: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let ok = false;
      try {
        const res = await fetch("/api/onboarding/state", { method: "DELETE" });
        ok = res.ok;
      } catch {
        ok = false;
      }
      if (cancelled) return;
      if (ok) {
        router.replace(destination);
      } else {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, destination, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  if (!failed) return null;
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3 p-6 text-center">
      <p className="text-sm text-muted-foreground max-w-md">
        We couldn&apos;t finish clearing your previous onboarding session. Please try again.
      </p>
      <Button onClick={retry}>Try again</Button>
    </div>
  );
}
