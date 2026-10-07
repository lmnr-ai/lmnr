"use client";

import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode } from "react";
import { createPortal } from "react-dom";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { type ClusterNode } from "@/components/signal/clusters-section/utils";
import { cn } from "@/lib/utils";

export interface HoverRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const relative = (value: string) => {
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : formatShortRelativeTime(d);
};

// Detail card that expands out of a hovered cluster row. Landing copy of the
// production one — see ./cluster-item for why this is duplicated.
export default function ClusterHoverCard({
  cluster,
  rect,
  icon,
  displayCount,
  isSelected,
}: {
  cluster: ClusterNode;
  rect: HoverRect;
  icon: ReactNode;
  displayCount: number;
  isSelected: boolean;
}) {
  if (typeof document === "undefined") return null;

  const createdAgo = relative(cluster.createdAt);
  const updatedAgo = relative(cluster.updatedAt);
  const hasChildren = cluster.children.length > 0;

  return createPortal(
    <AnimatePresence>
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
            <span className="whitespace-nowrap">{cluster.name}</span>
          </div>
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto", transition: { duration: 0.15, ease: "easeOut" } }}
            exit={{ opacity: 0, height: 0, transition: { duration: 0.15, ease: "easeOut" } }}
            className="flex items-center gap-3 text-xs text-muted-foreground overflow-hidden pl-6"
          >
            {hasChildren && (
              <span>
                <span className="text-foreground">{cluster.children.length}</span> sub-clusters
              </span>
            )}
            <span>
              <span className="text-foreground">{displayCount}</span>
              {` / ${cluster.numEvents} events in selected range`}
            </span>
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
    </AnimatePresence>,
    document.body
  );
}
