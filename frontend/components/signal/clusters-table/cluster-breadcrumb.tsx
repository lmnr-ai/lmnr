"use client";

import { AnimatePresence, motion } from "framer-motion";

import { type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";

import { type ClusterNode } from "./utils";

interface ClusterBreadcrumbProps {
  breadcrumb: ClusterNode[];
  selectedLeafId: string | null;
  visibleClusters: EventCluster[];
  pathIds: string[];
  onNavigateToBreadcrumb: (index: number) => void;
  onClearLeafSelection: () => void;
}

const slideIn = {
  initial: { opacity: 0.3, x: -45 },
  animate: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 30, mass: 0.3 } },
  exit: {
    opacity: 0.3,
    x: -20,
    transition: { duration: 0.1, ease: "easeOut" },
  },
};

const slashSlideIn = {
  initial: { opacity: 0.3, x: -12 },
  animate: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 30, mass: 0.8 } },
  exit: {
    opacity: 0.3,
    x: -8,
    transition: { duration: 0.1, ease: "easeOut" },
  },
};

// Slash width (~6px at text-sm) + gap to match parent's gap-2 (8px) on each side
// pl-[22px] = 6px slash + 8px left gap + 8px right gap
const SLASH_CONTAINER_PL = "pl-[22px]";

export default function ClusterBreadcrumb({
  breadcrumb,
  selectedLeafId,
  visibleClusters,
  pathIds,
  onNavigateToBreadcrumb,
  onClearLeafSelection,
}: ClusterBreadcrumbProps) {
  let selectedLeafName: string | null = null;
  if (selectedLeafId === UNCLUSTERED_ID) {
    selectedLeafName = "Unclustered Events";
  } else if (selectedLeafId) {
    const leafNode = visibleClusters.find((c) => c.id === selectedLeafId);
    if (leafNode) selectedLeafName = leafNode.name;
  }

  return (
    <div className="flex items-center text-sm min-w-0 pl-1">
      <button
        className={`hover:underline shrink-0 ${breadcrumb.length === 0 && !selectedLeafId ? "text-secondary-foreground" : "text-muted-foreground"}`}
        onClick={() => onNavigateToBreadcrumb(-1)}
      >
        All Events
      </button>

      <AnimatePresence initial={false} mode="wait">
        {breadcrumb.map((node, index) => {
          const isLast = index === breadcrumb.length - 1 && !selectedLeafId;
          return (
            <div
              key={node.id}
              className={`relative min-w-0 flex-shrink overflow-hidden ${SLASH_CONTAINER_PL}`}
              style={{ maskImage: "linear-gradient(to right, transparent, black 12px, black)" }}
            >
              <motion.span className="absolute left-[8px] top-0 text-muted-foreground" {...slashSlideIn}>
                /
              </motion.span>
              <motion.button
                className={`hover:underline truncate block max-w-full text-left ${
                  isLast ? "text-secondary-foreground" : "text-muted-foreground"
                }`}
                onClick={() => onNavigateToBreadcrumb(pathIds.indexOf(node.id))}
                {...slideIn}
              >
                {node.name}
              </motion.button>
            </div>
          );
        })}

        {selectedLeafName && (
          <div
            key={`leaf-${selectedLeafId}`}
            className={`relative min-w-0 flex-shrink overflow-hidden ${SLASH_CONTAINER_PL}`}
            style={{ maskImage: "linear-gradient(to right, transparent, black 12px, black)" }}
          >
            <motion.span className="absolute left-[8px] top-0 text-muted-foreground" {...slashSlideIn}>
              /
            </motion.span>
            <motion.button
              className="text-secondary-foreground hover:underline truncate block max-w-full text-left"
              onClick={onClearLeafSelection}
              {...slideIn}
            >
              {selectedLeafName}
            </motion.button>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
