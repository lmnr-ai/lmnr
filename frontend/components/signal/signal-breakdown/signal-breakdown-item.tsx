"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { withOpacity } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

import SignalBreakdownIcon from "./signal-breakdown-icon";
import { type BreakdownNode } from "./types";

interface HoverRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const relTime = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : formatShortRelativeTime(d);
};

/** One breakdown bucket row: icon + name + global-scale proportion bar + count,
 * with a portal hover card. Generalised from the original ClusterItem. */
export default function SignalBreakdownItem({
  node,
  isSelected,
  filteredCount,
  total,
  onClick,
  isPaywall,
}: {
  node: BreakdownNode;
  isSelected: boolean;
  filteredCount: number | undefined;
  /** Total events in the selected range — denominator for the global proportion bar. */
  total: number;
  onClick: () => void;
  isPaywall?: boolean;
}) {
  const color = node.color;
  const hasChildren = node.children.length > 0;
  const displayCount = filteredCount ?? 0;
  // Share of ALL events in range; floor a non-zero share at 2% so tiny buckets stay visible.
  const barPct = total > 0 ? Math.max(Math.min((displayCount / total) * 100, 100), displayCount > 0 ? 2 : 0) : 0;
  const showRangeDenominator = filteredCount !== undefined && node.totalCount !== undefined;
  const createdAgo = useMemo(() => relTime(node.createdAt), [node.createdAt]);
  const updatedAgo = useMemo(() => relTime(node.updatedAt), [node.updatedAt]);

  const [hovered, setHovered] = useState(false);
  const [rect, setRect] = useState<HoverRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeaveTimeout = useCallback(() => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  }, []);
  const clearOpenTimeout = useCallback(() => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    if (!hovered) return;
    const startY = window.scrollY;
    const startX = window.scrollX;
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) < 4 && Math.abs(window.scrollX - startX) < 4) return;
      clearLeaveTimeout();
      setHovered(false);
      setRect(null);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hovered, clearLeaveTimeout]);

  const handleMouseEnter = useCallback(() => {
    clearLeaveTimeout();
    clearOpenTimeout();
    openTimeoutRef.current = setTimeout(() => {
      if (buttonRef.current) {
        const r = buttonRef.current.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        setHovered(true);
      }
    }, 500);
  }, [clearLeaveTimeout, clearOpenTimeout]);

  const scheduleClose = useCallback(() => {
    clearOpenTimeout();
    clearLeaveTimeout();
    leaveTimeoutRef.current = setTimeout(() => {
      setHovered(false);
      setRect(null);
    }, 80);
  }, [clearLeaveTimeout, clearOpenTimeout]);

  const icon = <SignalBreakdownIcon icon={node.icon} isSelected={isSelected} isPaywall={isPaywall} />;

  return (
    <>
      <button
        ref={buttonRef}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors text-secondary-foreground w-full min-w-0",
          isPaywall ? "cursor-default" : "cursor-pointer",
          !isPaywall && hovered && "bg-muted",
          isSelected && "bg-sidebar-accent font-medium text-primary-foreground"
        )}
        onClick={isPaywall ? undefined : onClick}
        onWheel={() => {
          clearOpenTimeout();
          clearLeaveTimeout();
          setHovered(false);
          setRect(null);
        }}
        onMouseEnter={isPaywall ? undefined : handleMouseEnter}
        onMouseLeave={isPaywall ? undefined : scheduleClose}
      >
        {icon}
        <span className={cn("flex-1 min-w-0 truncate", isPaywall && "blur-[5px] select-none")}>{node.name}</span>
        <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-[2px] bg-foreground/10">
          <span className="block h-full" style={{ width: `${barPct}%`, backgroundColor: withOpacity(color, 0.7) }} />
        </span>
        <span className="text-muted-foreground text-xs shrink-0 w-[30px] text-right">{displayCount}</span>
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {hovered && rect && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.15 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="fixed z-50 pointer-events-none"
                style={{ top: rect.top, left: rect.left, minWidth: rect.width }}
              >
                <motion.div
                  className={cn(
                    "flex flex-col pl-2 pr-3 pt-1.5 pb-1 rounded text-sm text-left overflow-hidden",
                    "bg-muted outline -outline-offset-1 outline-border shadow-md shadow-background/80 w-full",
                    isSelected && "font-medium"
                  )}
                  initial={{ width: rect.width, height: rect.height }}
                  animate={{ width: "auto", height: "auto", transition: { duration: 0.15, ease: "easeOut" } }}
                  exit={{ width: rect.width, height: rect.height, transition: { duration: 0.15, ease: "easeOut" } }}
                  style={{ minWidth: rect.width, minHeight: rect.height }}
                >
                  <div className="flex items-center gap-2 w-full">
                    {icon}
                    <span className="whitespace-nowrap">{node.name}</span>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto", transition: { duration: 0.15, ease: "easeOut" } }}
                    exit={{ opacity: 0, height: 0, transition: { duration: 0.15, ease: "easeOut" } }}
                    className="flex items-center gap-3 text-xs text-muted-foreground overflow-hidden pl-6"
                  >
                    {hasChildren && (
                      <span>
                        <span className="text-foreground">{node.children.length}</span> sub-items
                      </span>
                    )}
                    <span>
                      <span className="text-foreground">{displayCount}</span>
                      {showRangeDenominator ? ` / ${node.totalCount} events in selected range` : ` events`}
                    </span>
                    {node.hoverStats?.map((s) => (
                      <span key={s.label}>
                        <span className="text-foreground">{s.value}</span> {s.label}
                      </span>
                    ))}
                    {createdAgo && (
                      <span>
                        Created <span className="text-foreground">{createdAgo}</span>
                      </span>
                    )}
                    {updatedAgo && (
                      <span>
                        Updated <span className="text-foreground">{updatedAgo}</span>
                      </span>
                    )}
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
