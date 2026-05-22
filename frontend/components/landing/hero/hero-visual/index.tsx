"use client";

import { useScroll, useTransform } from "framer-motion";

import { EXTENDED_CELL_KEYS, ICON_CELL_MAP } from "./cells";
import DiamondGrid from "./diamond-grid";
import ExtendedDiamondsOverlay from "./extended-diamonds-overlay";
import GridFadeWrapper from "./grid-fade-wrapper";

// Pixels of page scroll over which the diamond cluster finishes settling.
// Phase 1 = the spring on mount (each diamond → its per-cell `target`).
// Phase 2 = this scroll-driven completion (everything → 1, full cluster).
// Bump if you want the scroll handoff to feel less abrupt.
const SCROLL_COMPLETE_DISTANCE = 400;

// Hero visual (Figma 4173:30043). Layered z-index plan:
//   z-0  radial highlight  (behind grid — subtle lift in field)
//   z-10 diamond grid
//   z-20+ extended diamonds (per-cell zIndex from CELLS_RAW in ./cells)
//   z-40 left-edge fade    (masks grid into page bg on the left)
//   z-50 top-edge fade     (soft top vignette across full width)
//
// Owns the scroll observer for phase-2 completion. scrollProgress is
// 0 at the top of the page and ramps to 1 by SCROLL_COMPLETE_DISTANCE
// pixels of scroll, then clamps. Each ExtendedDiamondCell consumes it
// via useTransform.
const HeroVisual = () => {
  const { scrollY } = useScroll();
  const scrollProgress = useTransform(scrollY, [0, SCROLL_COMPLETE_DISTANCE], [0, 1], { clamp: true });

  return (
    <div className="relative w-[880px] h-[300px] rounded-sm overflow-hidden">
      <GridFadeWrapper className="absolute inset-0">
        <div
          aria-hidden
          className="absolute left-0 bottom-[-400px] size-[600px] opacity-40 pointer-events-none z-0"
          style={{
            background: "radial-gradient(circle, var(--color-landing-surface-400) 0%, transparent 60%)",
          }}
        />
        <DiamondGrid
          className="absolute left-[-274px] top-1/2 -translate-y-1/2 w-[668px] h-[1157px] z-10"
          emptyCells={EXTENDED_CELL_KEYS}
          iconCells={ICON_CELL_MAP}
        />
        <ExtendedDiamondsOverlay scrollProgress={scrollProgress} />
      </GridFadeWrapper>
      <div
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[328px] opacity-80 pointer-events-none z-40 bg-gradient-to-r from-landing-surface-700 to-transparent"
      />
      <div
        aria-hidden
        className="absolute left-0 top-0 w-full size-[300px] opacity-40 pointer-events-none z-50 bg-gradient-to-b from-landing-surface-700 to-transparent"
      />
    </div>
  );
};

export default HeroVisual;
