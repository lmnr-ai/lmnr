"use client";

import { motion, type Transition, type Variants } from "framer-motion";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StageVariant = "timeline" | "transcript" | "span" | "ai" | "full";

export const STAGES: StageVariant[] = ["timeline", "transcript", "span", "ai", "full"];

interface KeepCorners {
  tl?: boolean;
  tr?: boolean;
  bl?: boolean;
  br?: boolean;
}

interface Props {
  activeIn: StageVariant[];
  connectedIn: StageVariant[];
  keepCorners?: KeepCorners;
  offsetX?: number;
  offsetY?: number;
  className?: string;
  children?: ReactNode;
}

const RADIUS = 8;

const TWEEN: Transition = { type: "tween", duration: 0.2, ease: "easeInOut" };

const TraceSection = ({
  activeIn,
  connectedIn,
  keepCorners = {},
  offsetX = 0,
  offsetY = 0,
  className,
  children,
}: Props) => {
  const wrapperVariants: Variants = {};
  const coverVariants: Variants = {};

  for (const stage of STAGES) {
    const active = activeIn.includes(stage);
    const connected = connectedIn.includes(stage);
    wrapperVariants[stage] = {
      x: connected ? 0 : offsetX,
      y: connected ? 0 : offsetY,
      outlineColor: active ? "var(--color-landing-surface-400)" : "var(--color-landing-surface-500)",
      borderTopLeftRadius: connected && !keepCorners.tl ? 0 : RADIUS,
      borderTopRightRadius: connected && !keepCorners.tr ? 0 : RADIUS,
      borderBottomLeftRadius: connected && !keepCorners.bl ? 0 : RADIUS,
      borderBottomRightRadius: connected && !keepCorners.br ? 0 : RADIUS,
      transition: TWEEN,
    };
    coverVariants[stage] = {
      opacity: active ? 0 : 1,
      pointerEvents: active ? "none" : "auto",
      transition: TWEEN,
    };
  }

  return (
    <motion.div
      variants={wrapperVariants}
      className={cn("relative overflow-hidden outline outline-solid -outline-offset-1", className)}
    >
      <div className="relative w-full h-full overflow-hidden isolate">{children}</div>
      <motion.div variants={coverVariants} className="absolute inset-0 bg-landing-surface-700/90 z-10" />
    </motion.div>
  );
};

export default TraceSection;
