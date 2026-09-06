"use client";

import { type CSSProperties } from "react";

import { cn } from "@/lib/utils";

import { BAND, SURFACE } from "../cluster-icicle/constants";
import { SHIMMER } from "./constants";
import { type LaidNode, layOut, ROOT_LEVEL, type SkeletonNode } from "./forest";

interface Props {
  node: SkeletonNode;
  /** 0–1, the crest's position along the strip this frame. */
  phase: number;
  level: number;
  /** This column's slice of the strip, 0–1. Carried down rather than measured:
   *  it is the shimmer's only input and has only to be roughly right. */
  x: number;
  span: number;
}

/**
 * A placeholder column: its own pill, then its children's row underneath.
 *
 * Same construction as a real band — `flexBasis: 0` with `flexGrow` as the value
 * axis, child rows `items-end` so a column bottoms out on the strip — so the two
 * occupy the same space and the swap is invisible.
 */
export default function SkeletonColumn({ node, phase, level, x, span }: Props) {
  const kids = node.children ?? [];
  const laid: LaidNode[] = layOut(kids, x, span);

  // A raised cosine on the band's CENTRE, so the crest sweeps left to right.
  const lift = 0.5 + 0.5 * Math.cos(2 * Math.PI * ((x + span / 2) / SHIMMER.length - phase));
  const band: CSSProperties = {
    height: BAND.rowHeight,
    borderRadius: BAND.radius,
    minWidth: BAND.minWidth,
    opacity: SHIMMER.min + (SHIMMER.max - SHIMMER.min) * lift,
  };

  return (
    <div className="flex min-w-0 flex-col" style={{ flexBasis: 0, flexGrow: node.weight, gap: BAND.rowGap }}>
      <div style={band} className={cn("w-full shrink-0", SURFACE.band)} />
      {kids.length > 0 && (
        <div
          className="flex min-w-0 flex-row items-end"
          // A root's children are the strip's groups and take the wider gap;
          // everything deeper is siblings inside a group.
          style={{ gap: level === ROOT_LEVEL ? BAND.groupGap : BAND.columnGap }}
        >
          {laid.map((kid, i) => (
            <SkeletonColumn key={i} node={kid.node} phase={phase} level={level - 1} x={kid.x} span={kid.span} />
          ))}
        </div>
      )}
    </div>
  );
}
