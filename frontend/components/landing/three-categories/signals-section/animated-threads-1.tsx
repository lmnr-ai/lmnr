"use client";

import { type MotionValue } from "framer-motion";
import StaggeredPath from "./staggered-path";

const Y_VALUES = [0.5, 12.5996, 24.6992, 36.8008, 48.9004, 61];

// Hardcoded random-ish start offsets (up to +/-0.25 range)
const OFFSETS = [-0.14, 0.19, -0.06, 0.22, -0.20, 0.11];

/** Straight horizontal lines (between definition & events) */
const AnimatedThreads1 = ({ progress }: { progress: MotionValue<number> }) => (
  <svg width="220" height="62" viewBox="0 0 220 62" fill="none" className="w-full h-full">
    {/* Track */}
    {Y_VALUES.map((y, i) => (
      <path key={`track-${i}`} d={`M0 ${y}H220`} stroke="var(--color-landing-surface-400)" />
    ))}
    {/* Progress */}
    {Y_VALUES.map((y, i) => (
      <StaggeredPath key={`progress-${i}`} d={`M0 ${y}H220`} offset={OFFSETS[i]} progress={progress} />
    ))}
  </svg>
);

export default AnimatedThreads1;
