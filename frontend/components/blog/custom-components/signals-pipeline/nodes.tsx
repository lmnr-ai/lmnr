import Image from "next/image";

import agentMark from "@/assets/landing/hero/agent-mark.svg";

import { type Rect } from "./geometry";

interface ProcessNodeProps {
  rect: Rect;
  color: string;
  reveal: number;
}

export const ProcessNode = ({ rect, color, reveal }: ProcessNodeProps) => (
  <div
    className="absolute flex origin-center items-center justify-center bg-surface-350"
    style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, opacity: reveal, transform: `scale(${reveal})` }}
  >
    <div className="flex size-[32px] items-center justify-center rounded-full" style={{ backgroundColor: color }}>
      <Image
        src={agentMark}
        alt=""
        className="size-[24px] animate-[spin_1.2s_linear_infinite] motion-reduce:animate-none"
      />
    </div>
  </div>
);

// Extra breathing room between a label and the element below it.
const LABEL_GAP = 4;

// Centred over its element; the span's bg-surface-200 hides only the dots behind the text.
export const GridLabel = ({ rect, text, opacity }: { rect: Rect; text: string; opacity: number }) => (
  <div
    className="absolute flex h-[20px] items-center justify-center"
    style={{ left: rect.x, top: rect.y - LABEL_GAP, width: rect.w, opacity }}
  >
    <span className="bg-surface-200 px-[6px] font-sans-landing text-[12px] leading-[20px] whitespace-nowrap text-foreground-100">
      {text}
    </span>
  </div>
);

// Bleeds past the canvas by whole cells so dots stay aligned while reaching the frame's edges.
const BLEED_CELLS = 60;

export const DotGrid = ({ width, height, cell }: { width: number; height: number; cell: number }) => (
  <svg
    aria-hidden
    className="pointer-events-none absolute top-0"
    style={{ left: -BLEED_CELLS * cell }}
    width={width + 2 * BLEED_CELLS * cell}
    height={height}
  >
    <defs>
      <pattern id="blog-signals-dots" patternUnits="userSpaceOnUse" width={cell} height={cell}>
        <circle cx={cell / 2} cy={cell / 2} r={1.5} fill="#2e2e2e" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#blog-signals-dots)" />
  </svg>
);
