"use client";

import { cn } from "@/lib/utils";
import { useScroll, useTransform, motion } from "framer-motion";
import { useRef } from "react";

interface Props {
  className?: string;
}

const ClusteringImage = ({ className }: Props) => {
  const clusters = [
    { name: "Agent misclicks submit button", subClusters: 3, events: 127, highlighted: true },
    { name: "Page loading failure", subClusters: 2, events: 89, highlighted: false },
    { name: "Authentication timeout errors", subClusters: 4, events: 156, highlighted: false },
    { name: "Network connection failures", subClusters: 1, events: 43, highlighted: false },
    { name: "Invalid form data submissions", subClusters: 3, events: 92, highlighted: false },
    { name: "API rate limit exceeded", subClusters: 2, events: 71, highlighted: false },
    { name: "Session expiration issues", subClusters: 4, events: 134, highlighted: false },
    { name: "Database query timeouts", subClusters: 1, events: 38, highlighted: false },
    { name: "Memory allocation failures", subClusters: 2, events: 67, highlighted: false },
  ];

  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center start"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.8, 1]);

  return (
    <motion.div
      ref={ref}
      style={{ opacity }}
      className={cn(
        "bg-landing-surface-700 flex items-end justify-center overflow-clip rounded-lg relative md:p-8",
        "p-6",
        className
      )}
    >
      {/* Clusters Table */}
      <div className={cn(
        "absolute bg-landing-surface-600 border border-landing-surface-400 flex flex-col items-start justify-center rounded w-[747px] md:left-[72px] md:top-[52px] md:gap-3 md:px-6 md:py-4",
        "left-[52px] top-[32px] gap-2 px-4 py-3"
      )}>
        <p className={cn(
          "font-medium leading-normal text-landing-text-300 md:text-[20px]",
          "text-[16px]"
        )}>Clusters</p>

        <div className="bg-landing-surface-500 border border-landing-text-600 flex flex-col items-start overflow-clip rounded w-full">
          {/* Table Header */}
          <div className={cn(
            "border-b border-landing-text-600 flex items-center w-full md:px-4 md:py-2",
            "px-3 py-1.5"
          )}>
            <div className={cn(
              "flex items-start justify-between text-landing-text-500 w-full md:text-xs",
              "text-[10px]"
            )}>
              <p className="w-[260px]">Cluster</p>
              <p className="flex-1">Sub clusters</p>
              <p className="flex-1">Events</p>
            </div>
          </div>

          {/* Table Rows */}
          {clusters.map((cluster, index) => (
            <div
              key={index}
              className={cn(
                "border-b border-landing-text-600 flex items-center w-full md:px-4 md:py-2.5",
                "px-3 py-2",
                cluster.highlighted ? "bg-landing-primary-400-10" : ""
              )}
            >
              <div
                className={cn(
                  "flex items-start justify-between w-full md:text-sm",
                  "text-xs",
                  cluster.highlighted ? "text-landing-primary-400" : "text-landing-text-300"
                )}
              >
                <p className="w-[260px]">{cluster.name}</p>
                <p className="flex-1">{cluster.subClusters}</p>
                <p className="flex-1">{cluster.events}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gradient fade on left */}
      <div className="absolute left-0 bottom-0 w-full h-[80%] bg-gradient-to-t from-landing-surface-700 via-landing-surface-700/90 to-transparent" />
    </motion.div>
  );
};

export default ClusteringImage;
