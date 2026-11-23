"use client";

import GitHubStarsButton from "@/components/landing/header/github-stars-button.tsx";
import { useLocalStorage } from "@/hooks/use-local-storage.tsx";

import { CARD_BUTTON_CLASS, type CarouselSlide } from "./slide-card";

export const OPEN_SOURCE_STORAGE_KEY = "showStarCard";

/** The "Laminar is open-source" slide, dismissed per browser via localStorage. */
export function useOpenSourceSlide(enabled: boolean): CarouselSlide | null {
  const [showStarCard, setShowStarCard, isHydrated] = useLocalStorage(OPEN_SOURCE_STORAGE_KEY, true);
  if (!enabled || !isHydrated || !showStarCard) return null;

  return {
    id: "open-source",
    title: "Laminar is open-source",
    description: "Give us a star on GitHub!",
    action: (
      <GitHubStarsButton
        owner="lmnr-ai"
        repo="lmnr"
        className={`${CARD_BUTTON_CLASS} [&_span]:font-normal [&_span]:text-secondary-foreground [&_svg]:text-secondary-foreground`}
      />
    ),
    onDismiss: () => setShowStarCard(false),
    height: 102,
  };
}
