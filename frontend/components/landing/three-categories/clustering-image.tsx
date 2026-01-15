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
        "bg-landing-surface-700 flex items-end justify-center overflow-clip p-8 rounded-lg relative",
        className
      )}
    >
      {/* Clusters Table */}
      <div className="absolute bg-landing-surface-600 border border-landing-surface-400 flex flex-col gap-3 items-start justify-center left-[72px] px-6 py-4 rounded top-[52px] w-[747px]">
        <p className="font-medium leading-normal text-[20px] text-landing-text-300">Clusters</p>

        <div className="bg-landing-surface-500 border border-landing-text-600 flex flex-col items-start overflow-clip rounded w-full">
          {/* Table Header */}
          <div className="border-b border-landing-text-600 flex items-center px-4 py-2 w-full">
            <div className="flex items-start justify-between text-landing-text-500 text-xs w-full">
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
                "border-b border-landing-text-600 flex items-center px-4 py-2.5 w-full",
                cluster.highlighted ? "bg-landing-primary-400-10" : ""
              )}
            >
              <div
                className={cn(
                  "flex items-start justify-between text-sm w-full",
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
