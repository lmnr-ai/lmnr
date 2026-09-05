// The pill a real cluster gets: the thing you point at and click.
"use client";

import { type CSSProperties } from "react";

import { cn } from "@/lib/utils";

import { BAND, BAND_ID_ATTR, SURFACE } from "./constants";
import { type ViewNode } from "./fold";

/**
 * Every band is in exactly one of three states:
 *   hover   — the band being pointed at, or the pinned one
 *   default — no focus anywhere, or this band is under the focus
 *   muted   — some other cluster has the focus
 */
export type BandState = "hover" | "default" | "muted";

interface Props {
  node: ViewNode;
  state: BandState;
  inFocus: boolean;
  /** Pinned by a click — the band the tooltip stays out of the way of. */
  isSelected: boolean;
  /** The band's own box: fill, ring, radius, height. Built by the column, which
   *  is the only place that knows whether the panel is open. */
  style: CSSProperties;
  onSelect: (id: string) => void;
  /** Aim the strip's one tooltip at this band, or clear it on `null`. */
  onTip: (node: ViewNode | null, el?: HTMLElement) => void;
}

export default function ClusterBand({ node, state, inFocus, isSelected, style, onSelect, onTip }: Props) {
  return (
    <button
      type="button"
      aria-label={node.name}
      // Hover is read off this by the strip, which delegates it — see
      // `BAND_ID_ATTR`.
      {...{ [BAND_ID_ATTR]: node.id }}
      style={style}
      onPointerEnter={(e) => {
        // Nothing to tell the reader about the band they already picked — the
        // rest of the section is showing exactly these facts, so the tooltip
        // would be a second copy of them sitting on top of the strip.
        if (isSelected) {
          onTip(null);
          return;
        }
        // The band hands the strip its own element: that is the only thing the
        // strip cannot work out for itself, since the tooltip is anchored to the
        // strip's bottom edge and only borrows this band's left edge.
        onTip(node, e.currentTarget);
      }}
      onPointerLeave={() => onTip(null)}
      onClick={() => {
        // Selecting is the moment the tooltip stops being useful — same reason it
        // never opens on the selected band. The pointer is still here, so nothing
        // else would close it.
        onTip(null);
        onSelect(node.id);
      }}
      // No CSS :hover ring: pointing at a band already puts it in the `hover`
      // state through the strip's delegated hover, which styles it properly.
      className={cn(
        "flex w-full min-w-0 shrink-0 items-center overflow-hidden text-left",
        "transition-[filter,background-color,box-shadow] focus:outline-none",
        state === "muted" ? SURFACE.muted : SURFACE.band
      )}
    >
      <span
        className={cn(
          "pointer-events-none block min-w-0 truncate leading-tight",
          inFocus ? "text-foreground" : "text-foreground/40"
        )}
        style={{ fontSize: BAND.labelSize, paddingInlineStart: BAND.labelPadLeft }}
      >
        {node.name}
      </span>
    </button>
  );
}
