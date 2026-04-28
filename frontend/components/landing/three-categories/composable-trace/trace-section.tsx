"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Props {
  label: string;
  progress: MotionValue<number>;
  className?: string;
  children?: ReactNode;
}

const TraceSection = ({ label, progress, className, children }: Props) => {
  const borderOpacity = useTransform(progress, [0, 1], [1, 0]);
  const labelOpacity = useTransform(progress, [0.2, 0.6], [1, 0]);
  const radius = useTransform(progress, [0, 1], [8, 0]);
  const padding = useTransform(progress, [0, 1], [4, 0]);

  return (
    <motion.div style={{ borderRadius: radius, padding }} className={cn("relative overflow-hidden", className)}>
      <motion.div
        style={{ opacity: borderOpacity, borderRadius: radius }}
        className="absolute inset-0 border-2 border-landing-surface-400 pointer-events-none z-20"
      />
      <div className="relative w-full h-full bg-landing-surface-800/40 rounded">{children}</div>
      <motion.div
        style={{ opacity: labelOpacity }}
        className="absolute inset-0 flex items-start px-5 py-4 bg-landing-surface-700 rounded-md z-10"
      >
        <p className="font-space-grotesk text-2xl text-landing-text-300 leading-8">{label}</p>
      </motion.div>
    </motion.div>
  );
};

export default TraceSection;
