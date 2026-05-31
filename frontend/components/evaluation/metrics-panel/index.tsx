"use client";

import { parseAsString, useQueryState } from "nuqs";

import { useAggregation } from "@/components/evaluation/metrics-panel/aggregation-select";
import ColumnStrip from "@/components/evaluation/metrics-panel/column-strip";
import ExpandedDetail from "@/components/evaluation/metrics-panel/expanded-detail";
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
  const [expanded, setExpanded] = useQueryState("expandedMetric", parseAsString);
  const [aggregation] = useAggregation();

  const expandedStats = expanded ? (props.allStatistics?.[expanded] ?? null) : null;
  const expandedCStats = expanded ? (props.comparedAllStatistics?.[expanded] ?? null) : null;
  const expandedDist = expanded ? (props.allDistributions?.[expanded] ?? null) : null;
  const expandedCDist = expanded ? (props.comparedAllDistributions?.[expanded] ?? null) : null;

  return (
    <div className="relative shrink-0 py-4">
      {props.isLoading ? (
        <Skeleton className="h-[156px] w-full rounded-[4px]" />
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
  );
}
