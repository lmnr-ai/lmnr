"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";
import { ArrowRight, Bot, Hexagon, MessageCircle } from "lucide-react";

export type IconVariant = "arrow" | "bot" | "chat" | "hex";

const ICON_MAP = {
  arrow: ArrowRight,
  bot: Bot,
  chat: MessageCircle,
  hex: Hexagon,
} as const;

// Icons follow a simpler 2-stop ramp — no orange tint:
//   d = 0    → text-600 @ α 1
//   d ≥ 1    → transparent
const TEXT_600 = { r: 67, g: 68, b: 71 };

interface Props {
  variant: IconVariant;
  centerX: number;
  centerY: number;
  size: number;
  wavePx: MotionValue<number>;
  waveWidth: number;
  chevronShift: number;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
  hoverRadius: number;
}

const WaveIcon = ({
  variant,
  centerX,
  centerY,
  size,
  wavePx,
  waveWidth,
  chevronShift,
  mouseX,
  mouseY,
  hoverRadius,
}: Props) => {
  const effectiveX = centerX + chevronShift;

  const color = useTransform([wavePx, mouseX, mouseY], ([wp, mx, my]: number[]) => {
    const waveDist = Math.abs(wp - effectiveX) / waveWidth;
    const dx = mx - centerX;
    const dy = my - centerY;
    const hoverDist = Math.sqrt(dx * dx + dy * dy) / hoverRadius;
    const d = Math.min(waveDist, hoverDist);
    const a = d >= 1 ? 0 : 1 - d;
    return `rgba(${TEXT_600.r}, ${TEXT_600.g}, ${TEXT_600.b}, ${a.toFixed(3)})`;
  });

  const Icon = ICON_MAP[variant];

  return (
    <motion.div
      className="absolute pointer-events-none flex items-center justify-center"
      style={{
        left: centerX - size / 2,
        top: centerY - size / 2,
        width: size,
        height: size,
        color,
      }}
    >
      <Icon size={size} strokeWidth={1.5} />
    </motion.div>
  );
};

export default WaveIcon;
