"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";

import { type IconVariant } from "./cells";
import { TILE_SHELL, VARIANT_BG, VARIANT_ICON } from "./tile-styles";

const HEAD_SIZE = 24;
const TAIL_HEIGHT = 1;
const CONTAINER_HEIGHT = 42;

// #4A372F (warm dark brown) solid in the middle, fading to transparent
// at both ends. Anchored to the right (head end) at render time so a
// partial-extension tail still reads "denser near the head."
const STEM_GRADIENT =
  "linear-gradient(to right, rgba(74, 55, 47, 0) 0%, #4A372F 5%, #4A372F 60.3%, rgba(74, 55, 47, 0) 100%)";

// Same transform DiamondGrid applies to its cells via the parent
// wrapper. Re-applied directly here because the head lives OUTSIDE the
// grid's rotated wrapper.
const HEAD_TRANSFORM = "rotate(120deg) skewX(-30deg) scaleY(0.87)";

interface Props {
  /** 0 = at rest, head sits at the container's left edge with no tail.
   *  1 = fully extended, head sits `maxLength` to the right of the
   *  container's left edge with the tail spanning the gap. */
  extension: MotionValue<number>;
  /** Pixels the head travels when extension reaches 1. */
  maxLength: number;
  /** If set, render the head as a colored variant tile (icon + bg)
   *  instead of the default gray cell. Picked from ICON_CELL_MAP. */
  variant?: IconVariant;
  /** Outer wrapper class — use for absolute positioning of the origin
   *  (where the head sits at extension=0). */
  className?: string;
}

// Renders a single diamond that "extends" rightward from a fixed origin
// (the container's left edge). Pairs with DiamondGrid: each instance
// represents a grid cell that has shot out of its slot, leaving a streak
// behind. Layout is a flex row — tail grows, head is pushed right by it,
// so no absolute math is needed.
const ExtendedDiamond = ({ extension, maxLength, variant, className }: Props) => {
  const tailWidth = useTransform(extension, [0, 1], [0, maxLength]);

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
      {variant ? (
        <div
          className={cn("shrink-0", TILE_SHELL, VARIANT_BG[variant])}
          style={{ width: HEAD_SIZE, height: HEAD_SIZE, transform: HEAD_TRANSFORM }}
        >
          {VARIANT_ICON[variant]}
        </div>
      ) : (
        <div
          className="shrink-0 bg-landing-surface-400"
          style={{ width: HEAD_SIZE, height: HEAD_SIZE, transform: HEAD_TRANSFORM }}
        />
      )}
    </div>
  );
};

export default ExtendedDiamond;
