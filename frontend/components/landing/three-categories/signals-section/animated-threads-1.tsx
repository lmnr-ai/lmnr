"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";

const Y_VALUES = [0.5, 12.5996, 24.6992, 36.8008, 48.9004, 61];

// Hardcoded random-ish start offsets (up to +/-0.25 range)
const OFFSETS = [-0.14, 0.19, -0.06, 0.22, -0.20, 0.11];

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
