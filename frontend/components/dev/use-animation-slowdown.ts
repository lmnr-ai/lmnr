"use client";

import { useDialKit } from "dialkit";

/**
 * Dev-only multiplier for animation durations (1 = normal, 20 = 20x slower), so
 * sidebar animations can be inspected frame by frame. Framer springs run in JS,
 * which DevTools' animation-speed control doesn't slow down. Always 1 in production.
 */
export function useAnimationSlowdown(): number {
  const { slowdown } = useDialKit(
    "Animation",
    { slowdown: [1, 1, 20, 0.5] as [number, number, number, number] },
    { id: "animation-slowdown", persist: true }
  );
  return process.env.NODE_ENV === "production" ? 1 : slowdown;
}
