"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { ClaudeLogo, CodexLogo, CursorLogo } from "./logos";

const ROTATION_INTERVAL_MS = 5_000;
const BURST_INTERVAL_MS = 500;
const LOGOS = [ClaudeLogo, CodexLogo, CursorLogo] as const;

export function AnimatedCodingAgentIcons({ burst = false }: { burst?: boolean }) {
  const [index, setIndex] = useState(0);
  const [mountBurst, setMountBurst] = useState(true);
  const reduceMotion = useReducedMotion();
  const isBursting = burst || mountBurst;

  useEffect(() => {
    if (reduceMotion) return;

    const timeout = setTimeout(() => setMountBurst(false), BURST_INTERVAL_MS * LOGOS.length);
    return () => clearTimeout(timeout);
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return;
    const interval = setInterval(
      () => setIndex((current) => (current + 1) % LOGOS.length),
      isBursting ? BURST_INTERVAL_MS : ROTATION_INTERVAL_MS
    );
    return () => clearInterval(interval);
  }, [isBursting, reduceMotion]);

  const Logo = LOGOS[index];

  return (
    <span className="relative inline-flex size-4 items-center justify-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={index}
          className="absolute inline-flex"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.14 }}
        >
          <Logo className="size-5" />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export { ClaudeLogo, CodexLogo, CursorLogo } from "./logos";
