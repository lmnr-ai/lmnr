"use client";

import { type MotionValue } from "framer-motion";

import { EXTENDED_CELLS } from "./cells";
import ExtendedDiamondCell from "./extended-diamond-cell";

interface Props {
  /** 0..1 (clamped). At 1 every diamond reaches extension=1 regardless
   *  of its per-cell `target`. Owned by HeroVisual via useScroll. */
  scrollProgress: MotionValue<number>;
}

// Renders the 16 ExtendedDiamond overlays. Drop as an absolute sibling of
// DiamondGrid inside the hero visual container.
const ExtendedDiamondsOverlay = ({ scrollProgress }: Props) => (
  <>
    {EXTENDED_CELLS.map((cell) => (
      <ExtendedDiamondCell key={`${cell.row}-${cell.col}`} {...cell} scrollProgress={scrollProgress} />
    ))}
  </>
);

export default ExtendedDiamondsOverlay;
