"use client";

import { useDialKit } from "dialkit";

const EXIT_ROTATE_DEG = -10;
/** Seconds; slower than the content's ~0.35s spring so the backdrop lingers. */
const BACKDROP_FADE_S = 0.95;

/** Dev-tunable carousel motion. Production always uses the defaults (persisted dial values are ignored). */
export function useCarouselDials(): { exitRotate: number; backdropFade: number } {
  const { exitRotate, backdropFade } = useDialKit(
    "Carousel",
    {
      exitRotate: [EXIT_ROTATE_DEG, -45, 45, 1] as [number, number, number, number],
      backdropFade: [BACKDROP_FADE_S, 0.05, 3, 0.05] as [number, number, number, number],
    },
    { id: "sidebar-carousel", persist: true }
  );
  if (process.env.NODE_ENV === "production") return { exitRotate: EXIT_ROTATE_DEG, backdropFade: BACKDROP_FADE_S };
  return { exitRotate, backdropFade };
}
