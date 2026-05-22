"use client";

import { animate, useMotionValue } from "framer-motion";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import WaveIcon, { type IconVariant } from "./wave-icon";
import WaveLine from "./wave-line";

// Fixed pixel geometry — no responsive measurement. The visual is laid
// out once at module init; the container just renders the children.
const WIDTH = 880;
const COLS = 28;
const ROWS = 8;
const STRIDE = WIDTH / (COLS - 1);
const HEIGHT = STRIDE * (ROWS - 1);
const CENTER_Y = HEIGHT / 2;
const HALF_H = HEIGHT / 2;

const DOT_SIZE = 3;
const DOT_OFFSET = (DOT_SIZE - 1) / 2;

// Lines do NOT touch the dots — gap so the pattern reads as
// `dot (gap) line (gap) dot`.
const LINE_GAP_PX = 6;
const LINE_INSET = DOT_SIZE / 2 + LINE_GAP_PX;

// Icon size as a fraction of stride; icon center sits at the cell center.
const ICON_SIZE_FRAC = 0.4;
const ICON_SIZE = ICON_SIZE_FRAC * STRIDE;

// Wave — sweeps LEFT → RIGHT, finishes at WAVE_END_FRAC of width.
const WAVE_DURATION_S = 2.13;
const WAVE_WIDTH_FRAC = 0.6;
const WAVE_WIDTH_PX = WAVE_WIDTH_FRAC * WIDTH;
const WAVE_DELAY_S = 0.3;
const WAVE_END_FRAC = 0.9;
const WAVE_START_PX = -WAVE_WIDTH_PX;
const WAVE_END_PX = WAVE_END_FRAC * WIDTH;

// Chevron — `>` shape (vertex on the right, pointing in direction of
// motion). Middle Y leads, top/bottom trail.
const CHEVRON_PEAK_FRAC = 3.5;
const CHEVRON_PEAK_PX = CHEVRON_PEAK_FRAC * STRIDE;

// Hover radius (in strides) — distance from cursor at which activation
// reaches transparent.
const HOVER_RADIUS_FRAC = 10;
const HOVER_RADIUS = HOVER_RADIUS_FRAC * STRIDE;

// Deterministic per-cell icon assignment (seeded LCG so layout is stable).
const ICON_VARIANTS: IconVariant[] = ["arrow", "bot", "chat", "hex"];
const ICON_GRID: IconVariant[][] = (() => {
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const grid: IconVariant[][] = [];
  for (let r = 0; r < ROWS - 1; r++) {
    const row: IconVariant[] = [];
    for (let c = 0; c < COLS - 1; c++) {
      row.push(ICON_VARIANTS[Math.floor(rand() * ICON_VARIANTS.length)]);
    }
    grid.push(row);
  }
  return grid;
})();

const chevronShiftAtY = (y: number) => {
  const dyFrac = Math.abs(y - CENTER_Y) / HALF_H;
  return -CHEVRON_PEAK_PX * (1 - dyFrac);
};

// All line + icon + dot geometry pre-computed at module init.
interface LineCfg {
  key: string;
  x: number;
  y: number;
  length: number;
  horizontal: boolean;
  chevronShift: number;
}
const LINES: LineCfg[] = (() => {
  const out: LineCfg[] = [];
  for (let r = 0; r < ROWS; r++) {
    const ly = r * STRIDE;
    const chevronShift = chevronShiftAtY(ly);
    for (let c = 0; c < COLS - 1; c++) {
      out.push({
        key: `h-${r}-${c}`,
        x: c * STRIDE + LINE_INSET,
        y: ly,
        length: STRIDE - 2 * LINE_INSET,
        horizontal: true,
        chevronShift,
      });
    }
  }
  for (let r = 0; r < ROWS - 1; r++) {
    const lyTop = r * STRIDE;
    const chevronShift = chevronShiftAtY(lyTop + STRIDE / 2);
    for (let c = 0; c < COLS; c++) {
      out.push({
        key: `v-${r}-${c}`,
        x: c * STRIDE,
        y: lyTop + LINE_INSET,
        length: STRIDE - 2 * LINE_INSET,
        horizontal: false,
        chevronShift,
      });
    }
  }
  return out;
})();

interface IconCfg {
  key: string;
  variant: IconVariant;
  centerX: number;
  centerY: number;
  chevronShift: number;
}
const ICONS: IconCfg[] = (() => {
  const out: IconCfg[] = [];
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const cy = (r + 0.5) * STRIDE;
      out.push({
        key: `icon-${r}-${c}`,
        variant: ICON_GRID[r][c],
        centerX: (c + 0.5) * STRIDE,
        centerY: cy,
        chevronShift: chevronShiftAtY(cy),
      });
    }
  }
  return out;
})();

interface DotCfg {
  key: string;
  left: number;
  top: number;
}
const DOTS: DotCfg[] = (() => {
  const out: DotCfg[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      out.push({
        key: `dot-${r}-${c}`,
        left: c * STRIDE - DOT_OFFSET,
        top: r * STRIDE - DOT_OFFSET,
      });
    }
  }
  return out;
})();

interface Props {
  className?: string;
}

const HeroVisual = ({ className }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const wavePx = useMotionValue(WAVE_START_PX);
  const mouseX = useMotionValue(-99999);
  const mouseY = useMotionValue(-99999);

  useEffect(() => {
    const controls = animate(wavePx, WAVE_END_PX, {
      duration: WAVE_DURATION_S,
      ease: "linear",
      delay: WAVE_DELAY_S,
    });
    return () => controls.stop();
  }, [wavePx]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  };
  const handleMouseLeave = () => {
    mouseX.set(-99999);
    mouseY.set(-99999);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn("relative", className)}
      style={{ width: WIDTH, height: HEIGHT }}
    >
      {LINES.map((line) => (
        <WaveLine
          key={line.key}
          x={line.x}
          y={line.y}
          length={line.length}
          horizontal={line.horizontal}
          wavePx={wavePx}
          waveWidth={WAVE_WIDTH_PX}
          chevronShift={line.chevronShift}
          mouseX={mouseX}
          mouseY={mouseY}
          hoverRadius={HOVER_RADIUS}
        />
      ))}
      {ICONS.map((icon) => (
        <WaveIcon
          key={icon.key}
          variant={icon.variant}
          centerX={icon.centerX}
          centerY={icon.centerY}
          size={ICON_SIZE}
          wavePx={wavePx}
          waveWidth={WAVE_WIDTH_PX}
          chevronShift={icon.chevronShift}
          mouseX={mouseX}
          mouseY={mouseY}
          hoverRadius={HOVER_RADIUS}
        />
      ))}
      {DOTS.map((d) => (
        <div
          key={d.key}
          className="absolute rounded-full bg-zinc-500/60"
          style={{ left: d.left, top: d.top, width: DOT_SIZE, height: DOT_SIZE }}
        />
      ))}
    </div>
  );
};

export default HeroVisual;
