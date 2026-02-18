"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";

const PATHS = [
  "M0 485.809C262.495 537.821 316.237 240.205 476 240.205",
  "M0 387.149C262.495 443.258 316.237 228.205 476 228.205",
  "M0 290.821C262.495 317.161 316.237 216.205 476 216.205",
  "M0 6.60164C262.495 -45.4108 316.237 252.205 476 252.205",
  "M0 105.261C262.495 49.1517 316.237 264.205 476 264.205",
  "M0 201.589C262.495 175.249 316.237 276.205 476 276.205",
];

// Hardcoded random-ish start offsets (up to +/-0.25 range)
const OFFSETS = [0.08, -0.18, 0.21, -0.12, 0.15, -0.23];

const StaggeredPath = ({
  d,
  offset,
  progress,
}: {
  d: string;
  offset: number;
  progress: MotionValue<number>;
}) => {
  const pathLength = useTransform(progress, [Math.max(0, offset), 1], [0, 1]);
  return <motion.path d={d} stroke="#D0754E" strokeOpacity={0.6} style={{ pathLength }} />;
};

/** Fan-out threads (left of definition card) */
const AnimatedThreads0 = ({ progress }: { progress: MotionValue<number> }) => (
  <svg viewBox="0 0 476 493" fill="none" preserveAspectRatio="none" className="w-full h-full">
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

export default AnimatedThreads0;
