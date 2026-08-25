"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { type IconVariant } from "@/components/signal/clusters-section/cluster-list/cluster-icon";
import { type ClusterNode } from "@/components/signal/clusters-section/utils";
import { withOpacity } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

import ClusterIcon from "./cluster-icon";
import ClusterHoverCard, { type HoverRect } from "./hover-card";

// Landing copy of the production cluster row. Duplicated on purpose: `pulsing`
// is landing-page theatre, and threading it through production would put
// animation state in a component the whole app renders. The paywall path is the
// only production behaviour deliberately dropped.

/** Icon scale keyframes for the one-shot pulse. */
const PULSE_SCALE = [1, 1.3, 1];

export default function ClusterItem({
  cluster,
  iconVariant,
  color,
  isSelected,
  filteredCount,
  total,
  onClick,
  pulsing,
  pulseMs,
}: {
  cluster: ClusterNode;
  iconVariant: IconVariant;
  color: string;
  isSelected: boolean;
  filteredCount: number | undefined;
  /** Total events in the selected range — denominator for the global proportion bar. */
  total: number;
  onClick: () => void;
  /** Fires the one-shot icon pulse + count flash. */
  pulsing?: boolean;
  pulseMs: number;
}) {
  const displayCount = filteredCount ?? 0;
  // Proportion relative to ALL events in the range (global scale), not the current
  // sub-cluster slice. Floor a non-zero share at 2% so tiny clusters stay visible.
  const barPct = total > 0 ? Math.max(Math.min((displayCount / total) * 100, 100), displayCount > 0 ? 2 : 0) : 0;

  const [rect, setRect] = useState<HoverRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    if (openTimeout.current) clearTimeout(openTimeout.current);
    openTimeout.current = null;
    setRect(null);
  }, []);

  useEffect(() => close, [close]);

  // Measure after the cursor settles rather than the moment it crosses the row,
  // so scrolling past the list doesn't flash a card.
  const handleMouseEnter = useCallback(() => {
    if (openTimeout.current) clearTimeout(openTimeout.current);
    openTimeout.current = setTimeout(() => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (r) setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }, 500);
  }, []);

  const icon = <ClusterIcon iconVariant={iconVariant} color={color} isSelected={isSelected} pulsing={pulsing} />;
  // Fast in, slow out, matching the icon's flash.
  const flash = pulsing ? "text-white duration-100" : "duration-300";

  return (
    <>
      <button
        ref={buttonRef}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors text-secondary-foreground w-full min-w-0 cursor-pointer",
          rect && "bg-muted",
          isSelected && "bg-sidebar-accent font-medium text-primary-foreground"
        )}
        onClick={onClick}
        onWheel={close}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={close}
      >
        <motion.span
          className="flex"
          animate={pulsing ? { scale: PULSE_SCALE } : { scale: 1 }}
          transition={{ duration: pulseMs / 1000, ease: "easeOut" }}
        >
          {icon}
        </motion.span>
        <span className={cn("flex-1 min-w-0 truncate transition-colors", flash)}>{cluster.name}</span>
        {/* Global-scale proportion bar: this cluster's share of all events in range. */}
        <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-[2px] bg-foreground/10">
          <span className="block h-full" style={{ width: `${barPct}%`, backgroundColor: withOpacity(color, 0.7) }} />
        </span>
        <span
          className={cn(
            "text-xs shrink-0 w-[30px] text-right transition-colors",
            flash,
            !pulsing && "text-muted-foreground"
          )}
        >
          {displayCount}
        </span>
      </button>

      {rect && (
        <ClusterHoverCard
          cluster={cluster}
          rect={rect}
          icon={icon}
          displayCount={displayCount}
          isSelected={isSelected}
        />
      )}
    </>
  );
}
