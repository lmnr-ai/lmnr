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
          {/* Rust logo mask — horizontal fade across the logo's local 0..144
            extent. Using a luminance mask (default) means the rect's white-
            with-alpha fill turns into 0.1→0.7 visibility across the group.
            The two overlapping rust paths inside the masked group fill solid
            #F7A886, composite at full alpha first (no per-path stacking),
            then the whole layer is faded by the mask. */}
          <linearGradient id="lfi-rust-grad" x1="0" y1="0" x2="144" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="white" stopOpacity="0.05" />
            <stop offset="1" stopColor="white" stopOpacity="0.4" />
          </linearGradient>
          <mask
            id="lfi-rust-mask"
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="144"
            height="144"
          >
            <rect width="144" height="144" fill="url(#lfi-rust-grad)" />
          </mask>
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

          {/* LOGO — rendered ABOVE the diamond so the rust gear sits on top of
          the hole. The wrapping group carries a horizontal gradient mask so
          the logo fades from 10% on the left to 70% on the right. Paths
          inside fill SOLID #F7A886 — no per-path alpha stacking. */}
          <g mask="url(#lfi-rust-mask)" transform="translate(48, 6.4) scale(1.092)">
            <path
              fill="#F7A886"
              d="m71.05 23.68c-26.06 0-47.27 21.22-47.27 47.27s21.22 47.27 47.27 47.27 47.27-21.22 47.27-47.27-21.22-47.27-47.27-47.27zm-.07 4.2a3.1 3.11 0 0 1 3.02 3.11 3.11 3.11 0 0 1 -6.22 0 3.11 3.11 0 0 1 3.2-3.11zm7.12 5.12a38.27 38.27 0 0 1 26.2 18.66l-3.67 8.28c-.63 1.43.02 3.11 1.44 3.75l7.06 3.13a38.27 38.27 0 0 1 .08 6.64h-3.93c-.39 0-.55.26-.55.64v1.8c0 4.24-2.39 5.17-4.49 5.4-2 .23-4.21-.84-4.49-2.06-1.18-6.63-3.14-8.04-6.24-10.49 3.85-2.44 7.85-6.05 7.85-10.87 0-5.21-3.57-8.49-6-10.1-3.42-2.25-7.2-2.7-8.22-2.7h-40.6a38.27 38.27 0 0 1 21.41-12.08l4.79 5.02c1.08 1.13 2.87 1.18 4 .09zm-44.2 23.02a3.11 3.11 0 0 1 3.02 3.11 3.11 3.11 0 0 1 -6.22 0 3.11 3.11 0 0 1 3.2-3.11zm74.15.14a3.11 3.11 0 0 1 3.02 3.11 3.11 3.11 0 0 1 -6.22 0 3.11 3.11 0 0 1 3.2-3.11zm-68.29.5h5.42v24.44h-10.94a38.27 38.27 0 0 1 -1.24-14.61l6.7-2.98c1.43-.64 2.08-2.31 1.44-3.74zm22.62.26h12.91c.67 0 4.71.77 4.71 3.8 0 2.51-3.1 3.41-5.65 3.41h-11.98zm0 17.56h9.89c.9 0 4.83.26 6.08 5.28.39 1.54 1.26 6.56 1.85 8.17.59 1.8 2.98 5.4 5.53 5.4h16.14a38.27 38.27 0 0 1 -3.54 4.1l-6.57-1.41c-1.53-.33-3.04.65-3.37 2.18l-1.56 7.28a38.27 38.27 0 0 1 -31.91-.15l-1.56-7.28c-.33-1.53-1.83-2.51-3.36-2.18l-6.43 1.38a38.27 38.27 0 0 1 -3.32-3.92h31.27c.35 0 .59-.06.59-.39v-11.06c0-.32-.24-.39-.59-.39h-9.15zm-14.43 25.33a3.11 3.11 0 0 1 3.02 3.11 3.11 3.11 0 0 1 -6.22 0 3.11 3.11 0 0 1 3.2-3.11zm46.05.14a3.11 3.11 0 0 1 3.02 3.11 3.11 3.11 0 0 1 -6.22 0 3.11 3.11 0 0 1 3.2-3.11z"
            />
            <path
              fill="#F7A886"
              stroke="#F7A886"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              fillRule="evenodd"
              d="m115.68 70.95a44.63 44.63 0 0 1 -44.63 44.63 44.63 44.63 0 0 1 -44.63-44.63 44.63 44.63 0 0 1 44.63-44.63 44.63 44.63 0 0 1 44.63 44.63zm-.84-4.31 6.96 4.31-6.96 4.31 5.98 5.59-7.66 2.87 4.78 6.65-8.09 1.32 3.4 7.46-8.19-.29 1.88 7.98-7.98-1.88.29 8.19-7.46-3.4-1.32 8.09-6.65-4.78-2.87 7.66-5.59-5.98-4.31 6.96-4.31-6.96-5.59 5.98-2.87-7.66-6.65 4.78-1.32-8.09-7.46 3.4.29-8.19-7.98 1.88 1.88-7.98-8.19.29 3.4-7.46-8.09-1.32 4.78-6.65-7.66-2.87 5.98-5.59-6.96-4.31 6.96-4.31-5.98-5.59 7.66-2.87-4.78-6.65 8.09-1.32-3.4-7.46 8.19.29-1.88-7.98 7.98 1.88-.29-8.19 7.46 3.4 1.32-8.09 6.65 4.78 2.87-7.66 5.59 5.98 4.31-6.96 4.31 6.96 5.59-5.98 2.87 7.66 6.65-4.78 1.32 8.09 7.46-3.4-.29 8.19 7.98-1.88-1.88 7.98 8.19-.29-3.4 7.46 8.09 1.32-4.78 6.65 7.66 2.87z"
            />
          </g>

          {/* LINES — animated data streams, drawn above the logo so they pass
              across its silhouette as they fly in toward the diamond. */}
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
