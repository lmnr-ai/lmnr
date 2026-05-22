"use client";

import { animate, type MotionValue, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";

import { cellToHero, CONTAINER_HALF, HEAD_HALF, SPRING_BOUNCE, SPRING_DURATION } from "./cells";
import ExtendedDiamond from "./extended-diamond";

interface Props {
  row: number;
  col: number;
  maxLength: number;
  delay: number;
  zIndex: number;
  target: number;
  scrollProgress: MotionValue<number>;
}

// Per-cell wrapper so each ExtendedDiamond owns its own MotionValue and
// staggered launch — avoids the hooks-in-loop pitfall of trying to
// allocate the values in the parent.
//
// Two phase model:
//   Phase 1 — `mountExt` springs 0 → target on mount.
//   Phase 2 — `scrollProgress` (shared, 0..1) closes the remaining
//             `1 − target` gap as the user scrolls. Cells with
//             target=1 are unaffected by scroll; cells that landed
//             short complete to 1 as scrollProgress reaches 1.
const ExtendedDiamondCell = ({ row, col, maxLength, delay, zIndex, target, scrollProgress }: Props) => {
  const mountExt = useMotionValue(0);
  useEffect(() => {
    const controls = animate(mountExt, target, {
      type: "spring",
      duration: SPRING_DURATION,
      bounce: SPRING_BOUNCE,
      delay: 0.3 + delay,
    });
    return () => controls.stop();
  }, [mountExt, delay, target]);

  const extension = useTransform([mountExt, scrollProgress], ([m, s]: number[]) => Math.min(1, m + (1 - target) * s));

  const { x, y } = cellToHero(row, col);
  return (
    <div className="absolute pointer-events-none" style={{ left: x - HEAD_HALF, top: y - CONTAINER_HALF, zIndex }}>
      <ExtendedDiamond extension={extension} maxLength={maxLength} />
    </div>
  );
};

export default ExtendedDiamondCell;
