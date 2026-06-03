"use client";

import { AnimatePresence, motion } from "framer-motion";

import ClusterIcon, { type IconVariant } from "@/components/signal/clusters-section/cluster-list/cluster-icon";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { getClusterColorById, UNCLUSTERED_COLOR } from "@/lib/clusters/colors";

import { type ClusterNode } from "./utils";

function clusterIconVariant(node: ClusterNode): IconVariant {
  if (node.id === UNCLUSTERED_ID) return "circle-dashed";
  return node.children.length > 0 ? "boxes" : "box";
}

interface ClusterBreadcrumbProps {
  breadcrumb: ClusterNode[];
  selectedClusterId: string | null;
  onNavigateToBreadcrumb: (index: number) => void;
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

const levelTransition = {
  initial: { opacity: 0, width: 0 },
  animate: { opacity: 1, width: "auto" },
  exit: { opacity: 0, width: 0 },
  transition: { type: "spring", stiffness: 300, damping: 30, mass: 0.3 },
};

// Slash width (~6px at text-sm) + gap to match parent's gap-2 (8px) on each side
const SLASH_CONTAINER_PL = "pl-[22px]";

export default function ClusterBreadcrumb({
  breadcrumb,
  selectedClusterId,
  onNavigateToBreadcrumb,
}: ClusterBreadcrumbProps) {
  return (
    <div className="flex items-center text-sm w-full min-w-0 pl-1">
      <button
        className={`hover:underline shrink-0 ${!selectedClusterId ? "text-secondary-foreground" : "text-muted-foreground"}`}
        onClick={() => onNavigateToBreadcrumb(-1)}
      >
        Event clusters
      </button>

      {/* Outer: handles levels appearing/disappearing */}
      <AnimatePresence initial={false}>
        {breadcrumb.map((node, index) => {
          const isLast = index === breadcrumb.length - 1;
          return (
            <motion.div
              key={index}
              className={`relative min-w-0 overflow-hidden ${isLast ? "shrink-0" : "flex-shrink"} ${SLASH_CONTAINER_PL}`}
              style={{ maskImage: "linear-gradient(to right, transparent, black 12px, black)" }}
              {...levelTransition}
            >
              {/* Inner: handles swaps within this level (e.g. sibling leaf selection) */}
              <AnimatePresence initial={false} mode="wait">
                <motion.div key={node.id} className="flex items-center">
                  <motion.span className="absolute left-[8px] top-0 text-muted-foreground" {...slashSlideIn}>
                    /
                  </motion.span>
                  <motion.button
                    className={`hover:underline truncate flex items-center gap-1.5 max-w-full text-left ${
                      isLast ? "text-secondary-foreground" : "text-muted-foreground"
                    }`}
                    onClick={() => onNavigateToBreadcrumb(index)}
                    {...slideIn}
                  >
                    <ClusterIcon
                      iconVariant={clusterIconVariant(node)}
                      color={node.id === UNCLUSTERED_ID ? UNCLUSTERED_COLOR : getClusterColorById(node.id)}
                    />
                    <span className="truncate">{node.name}</span>
                  </motion.button>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
