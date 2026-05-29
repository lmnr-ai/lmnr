"use client";

import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import { useMemo } from "react";

import ColumnStrip from "@/components/evaluation/metrics-panel/column-strip";
import ExpandedDetail from "@/components/evaluation/metrics-panel/expanded-detail";
import {
  AGGREGATION_OPTIONS,
  type AggregationKind,
  DEFAULT_AGGREGATION,
  isBinaryDistribution,
} from "@/components/evaluation/metrics-panel/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const AGG_VALUES = AGGREGATION_OPTIONS.map((o) => o.value) as AggregationKind[];

export default function MetricsPanel(props: MetricsPanelProps) {
  const [expanded, setExpanded] = useQueryState("expandedMetric", parseAsString);
  const [aggregation, setAggregation] = useQueryState(
    "agg",
    parseAsStringEnum<AggregationKind>(AGG_VALUES).withDefault(DEFAULT_AGGREGATION)
  );

  const expandedStats = expanded ? (props.allStatistics?.[expanded] ?? null) : null;
  const expandedCStats = expanded ? (props.comparedAllStatistics?.[expanded] ?? null) : null;
  const expandedDist = expanded ? (props.allDistributions?.[expanded] ?? null) : null;
  const expandedCDist = expanded ? (props.comparedAllDistributions?.[expanded] ?? null) : null;

  // Binary scores collapse to a pass/fail rate, so the aggregation toggle is
  // meaningless when every score is binary — hide the dropdown in that case.
  const hasNonBinary = useMemo(() => {
    if (!props.allDistributions) return true;
    return props.scoreNames.some((name) => !isBinaryDistribution(props.allDistributions?.[name] ?? null));
  }, [props.scoreNames, props.allDistributions]);

  return (
    <div className="relative shrink-0 py-8">
      {!props.isLoading && hasNonBinary && (
        <div className="absolute top-0 right-0 z-10 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Aggregation</span>
          <Select value={aggregation} onValueChange={(v) => setAggregation(v as AggregationKind)}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGGREGATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
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
