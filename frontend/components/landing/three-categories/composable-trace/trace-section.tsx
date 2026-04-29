"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface KeepCorners {
  tl?: boolean;
  tr?: boolean;
  bl?: boolean;
  br?: boolean;
}

interface Props {
  label: string;
  progress: MotionValue<number>;
  fromX?: number;
  fromY?: number;
  keepCorners?: KeepCorners;
  className?: string;
  children?: ReactNode;
}

const RADIUS = 8;

const TraceSection = ({ label, progress, fromX = 0, fromY = 0, keepCorners = {}, className, children }: Props) => {
  const labelOpacity = useTransform(progress, [0, 1], [1, 0]);
  const x = useTransform(progress, [0, 1], [fromX, 0]);
  const y = useTransform(progress, [0, 1], [fromY, 0]);

  const tl = useTransform(progress, [0, 1], [RADIUS, keepCorners.tl ? RADIUS : 0]);
  const tr = useTransform(progress, [0, 1], [RADIUS, keepCorners.tr ? RADIUS : 0]);
  const bl = useTransform(progress, [0, 1], [RADIUS, keepCorners.bl ? RADIUS : 0]);
  const br = useTransform(progress, [0, 1], [RADIUS, keepCorners.br ? RADIUS : 0]);
  const borderTopLeftRadius = useTransform(tl, (v) => `${v}px`);
  const borderTopRightRadius = useTransform(tr, (v) => `${v}px`);
  const borderBottomLeftRadius = useTransform(bl, (v) => `${v}px`);
  const borderBottomRightRadius = useTransform(br, (v) => `${v}px`);

  const borderAlpha = useTransform(progress, [0, 1], [1, 0]);
  const borderColor = useTransform(borderAlpha, (v) => `rgba(37, 37, 38, ${v})`);

  return (
    <motion.div
      style={{
        x,
        y,
        borderColor,
        borderTopLeftRadius,
        borderTopRightRadius,
        borderBottomLeftRadius,
        borderBottomRightRadius,
      }}
      className={cn("relative overflow-hidden border border-solid", className)}
    >
      <div className="relative w-full h-full overflow-hidden isolate">{children}</div>
      <motion.div
        className="w-full z-10 bg-gradient-to-b from-25% from-landing-surface-700 to-transparent h-[200px] absolute top-0 left-0 pointer-events-none"
        style={{ opacity: labelOpacity }}
      />
      <motion.div
        style={{ opacity: labelOpacity }}
        className="absolute inset-0 flex items-start px-5 py-4 bg-landing-surface-700/50 z-10 pointer-events-none"
      >
        <p className="font-space-grotesk text-xl text-landing-text-200 leading-8">{label}</p>
      </motion.div>
    </motion.div>
  );
};

export default TraceSection;
