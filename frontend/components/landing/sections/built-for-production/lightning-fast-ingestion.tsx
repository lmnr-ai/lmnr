"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

import { cn } from "@/lib/utils";

// Diamond-shaped background lattice from the figma export. Programmatically
// generated rather than ~100 hardcoded rect transforms: 9 rows on a 22.5px
// y-step, each row's x_start offset by 13px per step away from the centre row
// (mirrors the 60° shear that turns each 24×24 rect into a rhombus).
const GRID_RECTS: Array<[number, number]> = (() => {
  const result: Array<[number, number]> = [];
  const Y_VALUES = [-6.07, 16.45, 38.97, 61.48, 84, 106.52, 129.03, 151.55, 174.07];
  const MIDDLE = 4;
  for (let i = 0; i < Y_VALUES.length; i++) {
    const xStart = -13.6 + 13 * Math.abs(i - MIDDLE);
    const count = Math.floor((298.4 - xStart) / 26) + 1;
    for (let j = 0; j < count; j++) {
      result.push([xStart + 26 * j, Y_VALUES[i]]);
    }
  }
  return result;
})();

// 9 horizontal data-stream paths converging on the diamond. Each has its own
// userSpaceOnUse gradient with a bright orange/peach tip at `xEnd` (the point
// where the line meets the diamond's left edge) and a transparent tail at
// `xStart` (far off-canvas left).
const LINES: Array<{ y: number; xStart: number; xEnd: number }> = [
  { y: 85, xStart: -214.305, xEnd: 219.49 },
  { y: 58, xStart: -260.578, xEnd: 173.217 },
  { y: 107, xStart: -266.367, xEnd: 167.428 },
  { y: 72, xStart: -324.203, xEnd: 109.592 },
  { y: 101, xStart: -208.523, xEnd: 225.271 },
  { y: 94, xStart: -249.586, xEnd: 184.209 },
  { y: 82, xStart: -202.734, xEnd: 231.061 },
  { y: 96, xStart: -367, xEnd: 66.7949 },
  { y: 66, xStart: -233.969, xEnd: 199.826 },
];

// Slide-in animation: each line starts translated -350 user-units to the left
// (its bright tip is off-canvas, hidden by the left-side dark fade overlay),
// then settles at translateX(0) where the tip touches the diamond. The
// gradient travels with the line because it's referenced from a path inside
// the transformed <motion.g> (userSpaceOnUse is evaluated in the referencing
// element's coord system, not the gradient's defining context).
//
// IMPORTANT: we trigger the animation off `useInView` on the OUTER container,
// not `whileInView` on each <motion.g>. The groups start off-canvas-left, so
// their own bbox is never in the viewport and a per-group whileInView never
// fires.
const LINE_TRAVEL = -350;
const LINE_DURATION = 1.4;
const LINE_STAGGER = 0.1;

interface Props {
  className?: string;
}

const LightningFastIngestion = ({ className }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, amount: 0.3 });

  return (
    <div ref={containerRef} className={cn("relative overflow-hidden bg-landing-surface-600", className)}>
      <svg
        width="300"
        height="168"
        viewBox="0 0 300 168"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="lfi-top-fade" x1="0" y1="299" x2="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1B1B1C" />
            <stop offset="1" stopColor="#1B1B1C" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id="lfi-trapezoid"
            x1="246"
            y1="85.1241"
            x2="-221.562"
            y2="354.768"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#D0754E" />
            <stop offset="0.75" stopColor="#D0754E" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lfi-left-fade" x1="0" y1="253" x2="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1B1B1C" />
            <stop offset="1" stopColor="#1B1B1C" stopOpacity="0" />
          </linearGradient>
          {LINES.map((line, i) => (
            <linearGradient
              key={`grad-${i}`}
              id={`lfi-line-${i}`}
              x1={line.xStart}
              y1={line.y + 0.5}
              x2={line.xEnd}
              y2={line.y + 0.5}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0.605769" stopColor="white" stopOpacity="0.05" />
              <stop offset="0.918269" stopColor="#FF7E46" />
              <stop offset="1" stopColor="#F3DDD3" />
            </linearGradient>
          ))}
        </defs>

        {/* Content layer (background + grid), shifted right 16px. Overlays
            are kept outside these shifted groups so they remain anchored to
            the container edges. */}
        <g transform="translate(16, 0)">
          <rect width="300" height="168" fill="#1B1B1C" />

          {GRID_RECTS.map(([x, y], i) => (
            <rect
              key={`grid-${i}`}
              width="24"
              height="24"
              transform={`matrix(0.5 0.866025 0.5 -0.866025 ${x} ${y})`}
              fill="#252526"
            />
          ))}
        </g>

        {/* Early left-side fade — sits BETWEEN the grid and everything else, so
          the lattice darkens toward the left edge but the orange funnel and
          diamond paint on top of the darkened lattice (unaffected).
          Stays anchored to the container's left edge (NOT shifted). */}
        <rect
          width="168"
          height="299"
          transform="matrix(-1.19249e-08 -1 -1 1.19249e-08 300 168)"
          fill="url(#lfi-top-fade)"
        />

        {/* Content layer (funnel + diamond + logo + lines), shifted right 16px. */}
        <g transform="translate(16, 0)">
          {/* HOLE — orange funnel + diamond. The funnel converges on the diamond
              from far-left; the diamond is the "portal" the rust logo emerges
              from. Drawn before the logo so the diamond is visually beneath. */}
          <path
            d="M246 85.0078L219.472 39.0078H-383L-383 131.008H219.472L246 85.0078Z"
            fill="url(#lfi-trapezoid)"
            fillOpacity="0.5"
          />
          <rect
            width="53.3085"
            height="53.3085"
            transform="matrix(-0.5 -0.866025 -0.5 0.866025 245.555 85.1797)"
            fill="#D0754E"
          />
          <rect
            width="42.0856"
            height="42.0856"
            transform="matrix(-0.5 -0.866025 -0.5 0.866025 245.555 85.1797)"
            fill="#F7A886"
          />

          {/* LINES — animated data streams flying into the diamond. */}
          {LINES.map((line, i) => (
            <motion.g
              key={`line-${i}`}
              initial={{ x: LINE_TRAVEL }}
              animate={inView ? { x: 0 } : { x: LINE_TRAVEL }}
              transition={{ duration: LINE_DURATION, delay: i * LINE_STAGGER, ease: "easeOut" }}
            >
              <path d={`M${line.xStart} ${line.y}H${line.xEnd}`} stroke={`url(#lfi-line-${i})`} strokeWidth="2" />
            </motion.g>
          ))}
        </g>

        {/* Final left-side fade — sits on top of everything (logo, lines)
            so their leftmost tails dissolve into the page background.
            Stays anchored to the container's left edge (NOT shifted). */}
        <rect
          width="168"
          height="253"
          transform="matrix(-1.19249e-08 -1 -1 1.19249e-08 251 168)"
          fill="url(#lfi-left-fade)"
        />
      </svg>
    </div>
  );
};

export default LightningFastIngestion;
