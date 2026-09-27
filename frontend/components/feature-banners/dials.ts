import { type TransitionConfig, useDialKit } from "dialkit";
import { type Transition } from "motion/react";

import { useFeatureBannerStore } from "./store";

// Tunables for the prototype. The DialKit panel is dev-only; in production these defaults apply.
export const useFeatureBannerDials = () => {
  const reset = useFeatureBannerStore((s) => s.reset);

  return useDialKit(
    "Feature banners",
    {
      resetAcknowledgments: { type: "action", label: "Reset acknowledgments" },
      card: {
        radius: [8, 0, 24, 1],
        padding: [10, 4, 24, 1],
        imageHeight: [88, 40, 200, 4],
        showImage: true,
        showDescription: true,
        showOpenSourceBadge: true,
        acknowledgeLabel: "Got it",
      },
      dismiss: {
        transition: { type: "spring", visualDuration: 0.35, bounce: 0.15 },
        exitOffsetY: [120, 0, 300, 4],
        exitRotate: [0, -20, 20, 1],
        enterOffsetY: [16, 0, 80, 2],
      },
      stack: {
        peekCount: [2, 0, 4, 1],
        peekOffset: [6, 0, 20, 1],
        peekScaleStep: [0.05, 0, 0.2, 0.01],
        _collapsed: true,
      },
      hero: {
        overlayOpacity: [0.85, 0, 1, 0.05],
        showDots: true,
        _collapsed: true,
      },
      compact: {
        thumbSize: [36, 20, 64, 2],
        expandOnHover: true,
        _collapsed: true,
      },
      modal: {
        maxWidth: [640, 400, 1000, 20],
        imageMaxHeight: [320, 120, 600, 10],
        _collapsed: true,
      },
    },
    { onAction: (action) => action === "resetAcknowledgments" && reset() }
  );
};

export type FeatureBannerDials = ReturnType<typeof useFeatureBannerDials>;

export const toMotionTransition = (config: TransitionConfig): Transition =>
  config.type === "spring" ? { ...config } : { duration: config.duration, ease: config.ease };
