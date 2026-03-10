"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Circle, CircleDashed, Folder } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { cn } from "@/lib/utils";

import { getClusterColor, withOpacity } from "./colors";
import { type ClusterNode } from "./utils";

interface ClusterListProps {
  visibleClusters: EventCluster[];
  selectedLeafId: string | null;
  drillDownDepth: number;
  filteredCountByCluster: Map<string, number>;
  onNavigateToCluster: (clusterId: string) => void;
  onToggleLeafSelection: (clusterId: string) => void;
  unclusteredCount: number;
  className?: string;
}

interface HoverRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function ClusterItem({
  cluster,
  index,
  drillDownDepth,
  isLeafSelected,
  filteredCount,
  onClick,
}: {
  cluster: EventCluster;
  index: number;
  drillDownDepth: number;
  isLeafSelected: boolean;
  filteredCount: number | undefined;
  onClick: () => void;
}) {
  const hasChildren = (cluster as ClusterNode).children.length > 0;
  const displayCount = filteredCount ?? cluster.numEvents;
  const showFilteredRange = filteredCount !== undefined && filteredCount !== cluster.numEvents;

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

  const icon = hasChildren ? (
    <Folder
      className="w-4 h-4 shrink-0"
      fill={withOpacity(getClusterColor(index, drillDownDepth), 0.25)}
      stroke={getClusterColor(index, drillDownDepth)}
      strokeWidth={1.5}
    />
  ) : (
    <Circle
      fill={
        isLeafSelected
          ? getClusterColor(index, drillDownDepth)
          : withOpacity(getClusterColor(index, drillDownDepth), 0.25)
      }
      stroke={getClusterColor(index, drillDownDepth)}
      className="size-3.5 rounded-full shrink-0"
    />
  );

  return (
    <>
      <button
        ref={buttonRef}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors cursor-pointer hover:bg-muted",
          isLeafSelected && "bg-sidebar-accent font-medium"
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
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
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
                    "flex flex-col gap-1 px-2 py-1.5 rounded text-sm text-left cursor-pointer",
                    "bg-muted border border-border shadow-lg shadow-black/20 w-full",
                    isLeafSelected && "font-medium"
                  )}
                  initial={{ width: rect.width, height: rect.height }}
                  animate={{ width: "auto", height: "auto" }}
                  exit={{ width: rect.width, height: rect.height }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  style={{ minWidth: rect.width, minHeight: rect.height }}
                >
                  <div className="flex items-center gap-2 w-full">
                    {icon}
                    <span className="whitespace-nowrap">{cluster.name}</span>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
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

export default function ClusterList({
  visibleClusters,
  selectedLeafId,
  drillDownDepth,
  filteredCountByCluster,
  onNavigateToCluster,
  onToggleLeafSelection,
  unclusteredCount,
  className,
}: ClusterListProps) {
  const isUnclusteredSelected = selectedLeafId === UNCLUSTERED_ID;
  const showUnclustered = drillDownDepth === 0;

  return (
    <div className={cn("border-r bg-secondary overflow-y-auto overflow-x-hidden", className)}>
      <div className="flex flex-col gap-0.5 py-2 px-2">
        {visibleClusters.length === 0 && !showUnclustered ? (
          <div className="text-muted-foreground text-sm py-4 text-center">No sub-clusters</div>
        ) : (
          <>
            {visibleClusters.map((cluster, index) => {
              const hasChildren = (cluster as ClusterNode).children.length > 0;
              const isLeafSelected = !hasChildren && selectedLeafId === cluster.id;
              const filteredCount = filteredCountByCluster.get(cluster.id);
              return (
                <ClusterItem
                  key={cluster.id}
                  cluster={cluster}
                  index={index}
                  drillDownDepth={drillDownDepth}
                  isLeafSelected={isLeafSelected}
                  filteredCount={filteredCount}
                  onClick={() => {
                    if (hasChildren) {
                      onNavigateToCluster(cluster.id);
                    } else {
                      onToggleLeafSelection(cluster.id);
                    }
                  }}
                />
              );
            })}

            {showUnclustered && (
              <>
                {visibleClusters.length > 0 && <div className="border-t my-1" />}
                <button
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors cursor-pointer hover:bg-muted",
                    isUnclusteredSelected && "bg-sidebar-accent font-medium"
                  )}
                  onClick={() => onToggleLeafSelection(UNCLUSTERED_ID)}
                >
                  {isUnclusteredSelected ? (
                    <Circle className={cn("size-3.5 shrink-0 fill-slate-400 stroke-none")} />
                  ) : (
                    <CircleDashed className={cn("size-3.5 shrink-0 text-slate-400")} />
                  )}
                  <span className="truncate">Unclustered Events</span>
                  <span className="text-muted-foreground text-xs ml-auto shrink-0">{unclusteredCount}</span>
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
