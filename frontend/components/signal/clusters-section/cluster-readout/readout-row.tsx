// One row of the readout's list. Extracted so the unclustered bucket — which has
// no ClusterNode behind it — sits on the same grid tracks as the clusters above
// it instead of being a lookalike built out of its own markup.
"use client";

import ClusterIcon, { type IconVariant } from "@/components/signal/clusters-section/cluster-icon";

interface Props {
  iconVariant: IconVariant;
  color: string;
  name: string;
  total: number;
  onPick: () => void;
  onHover: (hovering: boolean) => void;
}

export default function ReadoutRow({ iconVariant, color, name, total, onPick, onHover }: Props) {
  return (
    // The whole row is one button, spanning both columns as a subgrid so its
    // icon and name still sit on the list's own tracks. The pointer-up is
    // stopped as well as handled: the chart pane reads a bare pointer-up as
    // "clicked empty space, drop the selection", which would undo the pick on
    // the way out.
    <button
      type="button"
      className="col-span-2 grid grid-cols-subgrid items-center text-left text-muted-foreground transition-colors hover:text-foreground"
      onPointerUp={(e) => {
        e.stopPropagation();
        onPick();
      }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      <ClusterIcon
        iconVariant={iconVariant}
        color={color}
        iconClassName={iconVariant === "boxes" ? "size-4" : undefined}
      />
      <span className="flex min-w-0 items-center">
        {/* `flex-1`: without it the name hugs its text, so a short one drags
            the count in beside it and the column of numbers goes ragged. */}
        <span className="min-w-0 max-w-[320px] flex-1 truncate">{name}</span>
        {/* Fixed width and right-aligned, not just pushed to the end: with
            every name truncating at its cap the counts all START in the same
            place, so left-aligned they end wherever their digit count says. */}
        <span className="ml-2 min-w-[38px] shrink-0 text-right tabular-nums opacity-60">{total.toLocaleString()}</span>
      </span>
    </button>
  );
}
