import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useSidebar } from "@/components/ui/sidebar.tsx";
import { MOBILE_BREAKPOINT } from "@/hooks/use-mobile";
import { track } from "@/lib/posthog";

// Per browser: the intro is a one-time heads-up, not state anyone else needs.
const seenKey = (workspaceId: string) => `lmnr:trial-intro-seen:${workspaceId}`;

// useIsMobile reports false until its effect runs, which would read the desktop `open` while the
// card is really in the closed mobile sheet. Read the breakpoint directly instead.
const isCardVisible = (sidebarOpen: boolean, openMobile: boolean): boolean =>
  typeof window !== "undefined" && (window.innerWidth < MOBILE_BREAKPOINT ? openMobile : sidebarOpen);

const isSeen = (workspaceId: string): boolean => {
  try {
    return !!localStorage.getItem(seenKey(workspaceId));
  } catch {
    return true;
  }
};

// Onboarding has no plan step, so the first project visit after it opens the trial card on its own.
// A collapsed sidebar hides the card, and a popover anchored to it would float loose. Marked seen on
// close, so a reload before then shows it again.
export function useTrialIntro(workspaceId: string) {
  const fromOnboarding = useSearchParams().get("onboarding") === "true";
  const { open: sidebarOpen, openMobile } = useSidebar();
  const [intro, setIntro] = useState(
    () => fromOnboarding && isCardVisible(sidebarOpen, openMobile) && !isSeen(workspaceId)
  );

  useEffect(() => {
    if (intro) track("billing", "trial_intro_shown");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissIntro = useCallback(() => {
    setIntro(false);
    try {
      localStorage.setItem(seenKey(workspaceId), "1");
    } catch {
      // Storage blocked: the intro may show again next time, which is harmless.
    }
  }, [workspaceId]);

  return { intro, dismissIntro };
}
