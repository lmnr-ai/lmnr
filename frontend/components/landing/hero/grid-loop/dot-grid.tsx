import { useId } from "react";

import { CELL } from "./geometry";

// 4000px is a multiple of CELL, so the overhang keeps dots in phase with the diagram.
const OVERHANG = 4000;

interface DotGridProps {
  rows: number;
  /** Bleed past both sides of the parent so the dots reach the viewport edges. */
  overhang?: boolean;
}

export default function DotGrid({ rows, overhang = true }: DotGridProps) {
  const bleed = overhang ? OVERHANG : 0;
  const patternId = `dot-grid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg
      data-dot-grid
      aria-hidden="true"
      className="pointer-events-none absolute top-0"
      style={{ left: -bleed, width: `calc(100% + ${bleed * 2}px)`, height: rows * CELL }}
    >
      <defs>
        <pattern id={patternId} patternUnits="userSpaceOnUse" width={CELL} height={CELL}>
          <circle cx={CELL / 2} cy={CELL / 2} r={1.5} fill="#2e2e2e" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
