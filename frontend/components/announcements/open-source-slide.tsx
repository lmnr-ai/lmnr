import GitHubStarsButton from "@/components/landing/header/github-stars-button.tsx";

import { CARD_BUTTON_CLASS, type CarouselSlide } from "./slide-card";

/** The "Laminar is open-source" slide. Its dismissal is stored with announcement dismissals. */
export const buildOpenSourceSlide = (id: string, onDismiss: () => void): CarouselSlide => ({
  id,
  title: "Laminar is open-source",
  description: "Give us a star on GitHub!",
  action: (
    <GitHubStarsButton
      owner="lmnr-ai"
      repo="lmnr"
      className={`${CARD_BUTTON_CLASS} [&_span]:font-normal [&_span]:text-secondary-foreground [&_svg]:text-secondary-foreground`}
    />
  ),
  onDismiss,
  height: 102,
});
