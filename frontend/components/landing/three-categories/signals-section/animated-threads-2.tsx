"use client";

import { type MotionValue } from "framer-motion";

import StaggeredPath from "./staggered-path";

const PATHS = [
  "M0 102.732C79.024 102.732 159.824 66.4175 219.906 66.4175",
  "M0 90.6504C79.024 90.6504 159.824 12.4839 219.906 12.4839",
  "M0 42.2324C79.024 42.2324 159.824 78.4742 219.906 78.4742",
  "M0 66.4842C79.024 66.4842 159.824 144.427 219.906 144.427",
  "M0 54.4238C79.024 54.4238 159.824 132.423 219.906 132.423",
  "M0 78.5252C79.024 78.5252 159.824 0.499466 219.906 0.499466",
];

// Hardcoded random-ish start offsets (up to +/-0.25 range)
const OFFSETS = [0.16, -0.09, 0.24, -0.17, 0.05, -0.21];

/** Curved lines (between events & clusters) */
const AnimatedThreads2 = ({ progress }: { progress: MotionValue<number> }) => (
  <svg width="220" height="145" viewBox="0 0 220 145" fill="none" className="w-full h-full">
    {/* Track */}
    {PATHS.map((d, i) => (
      <path key={`track-${i}`} d={d} stroke="var(--color-landing-surface-400)" />
    ))}
    {/* Progress */}
    {PATHS.map((d, i) => (
      <StaggeredPath key={`progress-${i}`} d={d} offset={OFFSETS[i]} progress={progress} />
    ))}
  </svg>
);

export default AnimatedThreads2;
