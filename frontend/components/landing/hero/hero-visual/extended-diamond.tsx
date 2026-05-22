"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";

const HEAD_SIZE = 24;
const TAIL_HEIGHT = 1;
const CONTAINER_HEIGHT = 42;

// Stem gradient from Figma node 4186:31759. Four stops, projected onto
// a 692-wide visible region of a 902.66-wide gradient definition, so
// the rightmost visible color (at the head end) lands between the
// solid-gray and translucent-orange stops — about rgba(183,108,77,0.26).
// Anchored to the right (head end) at render time so a partial-
// extension tail still reads "more colored near the head."
const STEM_GRADIENT =
  "linear-gradient(to right, rgba(67, 68, 71, 0) 0%, #434447 5%, #434447 75.3%, rgba(183, 108, 77, 0.26) 100%)";

// Same transform DiamondGrid applies to its cells via the parent
// wrapper. Re-applied directly here because the head lives OUTSIDE the
// grid's rotated wrapper.
const HEAD_TRANSFORM = "rotate(120deg) skewX(-30deg) scaleY(0.87)";

interface Props {
  /** 0 = at rest, head sits at the container's left edge with no tail.
   *  1 = fully extended, head sits `maxLength` to the right of the
   *  container's left edge with the tail spanning the gap.
   *  Same value drives the gray→orange color tween of head and tail. */
  extension: MotionValue<number>;
  /** Pixels the head travels when extension reaches 1. */
  maxLength: number;
  /** Outer wrapper class — use for absolute positioning of the origin
   *  (where the head sits at extension=0). */
  className?: string;
}

// Renders a single diamond that "extends" rightward from a fixed origin
// (the container's left edge). Pairs with DiamondGrid: each instance
// represents a grid cell that has shot out of its slot, leaving a streak
// behind. Layout is a flex row — tail grows, head is pushed right by it,
// so no absolute math is needed.
const ExtendedDiamond = ({ extension, maxLength, className }: Props) => {
  const tailWidth = useTransform(extension, [0, 1], [0, maxLength]);
  const headColor = useTransform(extension, [0, 0.5, 1], ["#2E2E2F", "#4A372F", "#A86346"]);

  return (
    <div
      className={cn("relative flex items-center pointer-events-none", className)}
      style={{ width: maxLength + HEAD_SIZE, height: CONTAINER_HEIGHT }}
    >
      <motion.div
        className="shrink-0"
        style={{
          width: tailWidth,
          height: TAIL_HEIGHT,
          backgroundImage: STEM_GRADIENT,
          backgroundSize: `${maxLength}px 100%`,
          backgroundPosition: "right",
          backgroundRepeat: "no-repeat",
        }}
      />
      <motion.div
        className="shrink-0"
        style={{
          width: HEAD_SIZE,
          height: HEAD_SIZE,
          transform: HEAD_TRANSFORM,
          backgroundColor: headColor,
        }}
      />
    </div>
  );
};

export default ExtendedDiamond;
