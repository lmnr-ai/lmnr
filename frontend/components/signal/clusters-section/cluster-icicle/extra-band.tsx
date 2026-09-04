// The counter standing in for the clusters a row had no width for.
//
// It stands for a SET, not a cluster, so it never drives the focus — but it does
// open the tooltip, which is the only way into the clusters behind it.
"use client";

import { type CSSProperties } from "react";

import { cn } from "@/lib/utils";

import { BAND, EXTRA } from "./constants";
import { type ViewNode } from "./fold";

interface Props {
  node: ViewNode;
  /** The focused cluster came from in here; without it the strip shows nothing
   *  selected at all while a folded cluster is pinned. */
  holdsFocus: boolean;
  style: CSSProperties;
  /** Aim the strip's one tooltip at this band, or clear it on `null`. */
  onTip: (node: ViewNode | null, el?: HTMLElement) => void;
}

export default function ExtraBand({ node, holdsFocus, style, onTip }: Props) {
  return (
    <div
      style={style}
      // A bead only carries a number down its column — see `ViewNode.isBead`.
      onPointerEnter={node.isBead ? undefined : (e) => onTip(node, e.currentTarget)}
      onPointerLeave={node.isBead ? undefined : () => onTip(null)}
      className={cn(
        "flex w-full min-w-0 shrink-0 items-center overflow-hidden text-left",
        node.isBead && "pointer-events-none",
        holdsFocus ? EXTRA.focusClassName : EXTRA.className
      )}
    >
      <span
        className={cn(
          "pointer-events-none block min-w-0 truncate leading-tight",
          holdsFocus ? "text-foreground" : "text-foreground/40"
        )}
        // A couple of pixels more inset than a band's own: there is no glyph
        // sitting in the corner, so a bare "+36" needs the room one would have
        // taken to read as centred in the pill.
        style={{ fontSize: BAND.labelSize, paddingInline: BAND.paddingX + EXTRA.padLeft }}
      >
        {node.name}
      </span>
    </div>
  );
}
