"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Circle, CircleDashed, Folder } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type EventCluster } from "@/lib/actions/clusters";
import { cn } from "@/lib/utils";

import { withOpacity } from "../colors";
import { type ClusterNode } from "../utils";

export type IconVariant = "folder" | "circle" | "circle-dashed";

interface HoverRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function ClusterItem({
  cluster,
  iconVariant,
  color,
  isSelected,
  filteredCount,
  onClick,
}: {
  cluster: EventCluster;
  iconVariant: IconVariant;
  color: string;
  isSelected: boolean;
  filteredCount: number | undefined;
  onClick: () => void;
}) {
  const hasChildren = iconVariant === "folder";
  const displayCount = filteredCount ?? cluster.numEvents;
  const showFilteredRange = filteredCount !== undefined;

  const [hovered, setHovered] = useState(false);
  const [rect, setRect] = useState<HoverRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeaveTimeout = useCallback(() => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    clearLeaveTimeout();
    if (buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      setHovered(true);
    }
  }, [clearLeaveTimeout]);

  const scheduleClose = useCallback(() => {
    clearLeaveTimeout();
    leaveTimeoutRef.current = setTimeout(() => {
      setHovered(false);
      setRect(null);
    }, 80);
  }, [clearLeaveTimeout]);

  const icon =
    iconVariant === "folder" ? (
      <Folder className="w-4 h-4 shrink-0" fill={withOpacity(color, 0.25)} stroke={color} strokeWidth={1.5} />
    ) : iconVariant === "circle-dashed" ? (
      <CircleDashed className="size-3.5 shrink-0" stroke={color} />
    ) : (
      <Circle
        fill={isSelected ? color : withOpacity(color, 0.25)}
        stroke={color}
        className="size-3.5 rounded-full shrink-0"
      />
    );

  return (
    <>
      <button
        ref={buttonRef}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors cursor-pointer text-secondary-foreground",
          hovered && "bg-muted",
          isSelected && "bg-sidebar-accent font-medium text-primary-foreground"
        )}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={scheduleClose}
      >
        {icon}
        <span className="truncate">{cluster.name}</span>
        <span className="text-muted-foreground text-xs ml-auto shrink-0">{displayCount}</span>
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {hovered && rect && (
              <motion.div
                ref={overlayRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.15, delay: 0.5 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                className="fixed z-50"
                style={{
                  top: rect.top,
                  left: rect.left,
                  minWidth: rect.width,
                }}
                onMouseEnter={clearLeaveTimeout}
                onMouseLeave={() => {
                  setHovered(false);
                  setRect(null);
                }}
              >
                <motion.button
                  onClick={() => {
                    setHovered(false);
                    setRect(null);
                    onClick();
                  }}
                  className={cn(
                    "flex flex-col pl-2 pr-3 pt-1.5 pb-1 rounded text-sm text-left cursor-pointer overflow-hidden",
                    "bg-muted outline -outline-offset-1 outline-border shadow-md shadow-background/80 w-full",
                    isSelected && "font-medium"
                  )}
                  initial={{ width: rect.width, height: rect.height }}
                  animate={{
                    width: "auto",
                    height: "auto",
                    transition: { duration: 0.15, ease: "easeOut", delay: 0.5 },
                  }}
                  exit={{ width: rect.width, height: rect.height, transition: { duration: 0.15, ease: "easeOut" } }}
                  style={{ minWidth: rect.width, minHeight: rect.height }}
                >
                  <div className="flex items-center gap-2 w-full">
                    {icon}
                    <span className="whitespace-nowrap">{cluster.name}</span>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{
                      opacity: 1,
                      height: "auto",
                      transition: { duration: 0.15, ease: "easeOut", delay: 0.5 },
                    }}
                    exit={{ opacity: 0, height: 0, transition: { duration: 0.15, ease: "easeOut" } }}
                    className="flex items-center gap-3 text-xs text-muted-foreground overflow-hidden pl-6"
                  >
                    {hasChildren && (
                      <span>
                        <span className="text-foreground">{(cluster as ClusterNode).children.length}</span> sub-clusters
                      </span>
                    )}
                    <span>
                      <span className="text-foreground">{displayCount}</span>
                      {showFilteredRange ? ` / ${cluster.numEvents} events in selected range` : ` events`}
                    </span>
                  </motion.div>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
