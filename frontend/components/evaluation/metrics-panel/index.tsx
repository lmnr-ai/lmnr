"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useState } from "react";

import { useAggregation } from "@/components/evaluation/metrics-panel/aggregation-select";
import ClassicColumnStrip from "@/components/evaluation/metrics-panel/classic/column-strip";
import MiniColumnStrip from "@/components/evaluation/metrics-panel/column-strip";
import ExpandedDetail from "@/components/evaluation/metrics-panel/expanded-detail";
import MetricsChips from "@/components/evaluation/poc/metrics-chips";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";

interface MetricsPanelProps {
  scoreNames: string[];
  selectedScore?: string;
  setSelectedScore: (s: string) => void;
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  isComparison?: boolean;
  isLoading?: boolean;
  /** v0 (mini, 82px cards) vs v1 (classic, 156px gravity-packed cards). Default mini. */
  cardStyle?: "mini" | "classic";
}

const TRANSITION = { duration: 0.22, ease: "easeInOut" as const };

export default function MetricsPanel(props: MetricsPanelProps) {
  const [expanded, setExpanded] = useQueryState("expandedMetric", parseAsString);
  const [aggregation] = useAggregation();
  // Collapse experiment: does the permanent strip earn its height? Collapsed =
  // one row of score chips. Local state — survives trace switches (this
  // component doesn't remount) and intentionally resets across evals.
  const [collapsed, setCollapsed] = useState(false);
  const ColumnStrip = props.cardStyle === "classic" ? ClassicColumnStrip : MiniColumnStrip;

  const expandedStats = expanded ? (props.allStatistics?.[expanded] ?? null) : null;
  const expandedCStats = expanded ? (props.comparedAllStatistics?.[expanded] ?? null) : null;
  const expandedDist = expanded ? (props.allDistributions?.[expanded] ?? null) : null;
  const expandedCDist = expanded ? (props.comparedAllDistributions?.[expanded] ?? null) : null;

  // Loading always shows the strip slot (skeleton) — collapsed chips need real
  // data, so they can't be the loading state.
  const showChips = collapsed && !props.isLoading;

  return (
    <div className="relative shrink-0">
      <CollapseToggle collapsed={showChips} onToggle={() => setCollapsed((c) => !c)} />
      <AnimatePresence initial={false}>
        {showChips && (
          <motion.div
            key="chips"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={TRANSITION}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-1.5 py-2 pr-8">
              <MetricsChips
                scoreNames={props.scoreNames}
                allStatistics={props.allStatistics}
                comparedAllStatistics={props.comparedAllStatistics}
                isComparison={props.isComparison}
                selectedScore={props.selectedScore}
                onSelectScore={props.setSelectedScore}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {!showChips && (
          <motion.div
            key="strip"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={TRANSITION}
            className="overflow-hidden"
          >
            <div className="py-4 pr-8">
              {props.isLoading ? (
                <Skeleton className="h-[82px] w-full rounded-[4px]" />
              ) : expanded ? (
                <div className="h-[156px] border border-border rounded-[4px] bg-secondary overflow-hidden">
                  <ExpandedDetail
                    name={expanded}
                    statistics={expandedStats}
                    comparedStatistics={expandedCStats}
                    distribution={expandedDist}
                    comparedDistribution={expandedCDist}
                    isComparison={props.isComparison}
                    aggregation={aggregation}
                    onBack={() => setExpanded(null)}
                  />
                </div>
              ) : (
                <ColumnStrip
                  scoreNames={props.scoreNames}
                  allStatistics={props.allStatistics}
                  allDistributions={props.allDistributions}
                  comparedAllStatistics={props.comparedAllStatistics}
                  comparedAllDistributions={props.comparedAllDistributions}
                  isComparison={props.isComparison}
                  aggregation={aggregation}
                  onExpand={(name) => {
                    props.setSelectedScore(name);
                    setExpanded(name);
                  }}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className="absolute right-0 top-2 size-6 text-muted-foreground"
      title={collapsed ? "Expand score cards" : "Collapse score cards"}
    >
      {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
    </Button>
  );
}
