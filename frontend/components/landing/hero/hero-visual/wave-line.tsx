"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";

// Color as a function of normalized distance from an activation center
// (chevron wavefront, OR hover cursor — whichever is closer wins):
//   d = 0    → text-600 @ α 1       (landing-text-600 — quiet gray)
//   d = 0.5  → primary @ α 0.2      (faint orange halo)
//   d ≥ 1    → transparent           (rest state)
const TEXT_600 = { r: 67, g: 68, b: 71 };
const PRIMARY = { r: 208, g: 117, b: 78 };
const MID_ALPHA = 0.2;

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const colorAtDistance = (d: number): RGBA => {
  if (d >= 1) return { r: PRIMARY.r, g: PRIMARY.g, b: PRIMARY.b, a: 0 };
  if (d <= 0.5) {
    const t = d / 0.5;
    return {
      r: lerp(TEXT_600.r, PRIMARY.r, t),
      g: lerp(TEXT_600.g, PRIMARY.g, t),
      b: lerp(TEXT_600.b, PRIMARY.b, t),
      a: lerp(1, MID_ALPHA, t),
    };
  }
  const t = (d - 0.5) / 0.5;
  return { r: PRIMARY.r, g: PRIMARY.g, b: PRIMARY.b, a: MID_ALPHA * (1 - t) };
};

interface Props {
  x: number;
  y: number;
  length: number;
  horizontal: boolean;
  wavePx: MotionValue<number>;
  waveWidth: number;
  chevronShift: number;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
  hoverRadius: number;
}

const WaveLine = ({
  x,
  y,
  length,
  horizontal,
  wavePx,
  waveWidth,
  chevronShift,
  mouseX,
  mouseY,
  hoverRadius,
}: Props) => {
  const lineCenterX = x + (horizontal ? length / 2 : 0);
  const lineCenterY = y + (horizontal ? 0 : length / 2);
  const effectiveLineX = lineCenterX + chevronShift;

  const color = useTransform([wavePx, mouseX, mouseY], ([wp, mx, my]: number[]) => {
    // Chevron contribution — 1D distance along x.
    const waveDist = Math.abs(wp - effectiveLineX) / waveWidth;
    // Hover contribution — 2D distance to cursor.
    const dx = mx - lineCenterX;
    const dy = my - lineCenterY;
    const hoverDist = Math.sqrt(dx * dx + dy * dy) / hoverRadius;
    // Closer center wins.
    const d = Math.min(waveDist, hoverDist);
    const c = colorAtDistance(d);
    return `rgba(${c.r | 0}, ${c.g | 0}, ${c.b | 0}, ${c.a.toFixed(3)})`;
  });

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        width: horizontal ? length : 1,
        height: horizontal ? 1 : length,
        backgroundColor: color,
      }}
    />
  );
};

export default WaveLine;
