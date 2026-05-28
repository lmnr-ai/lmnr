"use client";

import { parseAsString, useQueryState } from "nuqs";

import ExpandedDetail from "@/components/evaluation/metrics-panel/expanded-detail";
import GridView from "@/components/evaluation/metrics-panel/grid-view";
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
}

export default function MetricsPanel(props: MetricsPanelProps) {
  // Grid drill-in. The only piece of view state that needs to survive
  // navigation / refresh — sort + viz style are now fixed defaults.
  const [expanded, setExpanded] = useQueryState("expandedMetric", parseAsString);

  const expandedStats = expanded ? (props.allStatistics?.[expanded] ?? null) : null;
  const expandedCStats = expanded ? (props.comparedAllStatistics?.[expanded] ?? null) : null;
  const expandedDist = expanded ? (props.allDistributions?.[expanded] ?? null) : null;
  const expandedCDist = expanded ? (props.comparedAllDistributions?.[expanded] ?? null) : null;

  return (
    <div className="relative border rounded-xl bg-secondary overflow-hidden h-72">
      {props.isLoading ? (
        <Skeleton className="h-full w-full" />
      ) : expanded ? (
        <ExpandedDetail
          name={expanded}
          statistics={expandedStats}
          comparedStatistics={expandedCStats}
          distribution={expandedDist}
          comparedDistribution={expandedCDist}
          isComparison={props.isComparison}
          binaryStyle="dual"
          onBack={() => setExpanded(null)}
        />
      ) : (
        <GridView
          {...props}
          density="full"
          binaryStyle="dual"
          sortKey="name"
          sortDir="asc"
          onExpand={(name) => setExpanded(name)}
        />
      )}
    </div>
  );
}
