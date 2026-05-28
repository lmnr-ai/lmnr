import { useMemo } from "react";

import { type BinaryStyle } from "@/components/evaluation/metrics-panel/binary-viz";
import MetricRow, { type MetricRowDensity } from "@/components/evaluation/metrics-panel/metric-row";
import SmartViz from "@/components/evaluation/metrics-panel/smart-viz";
import { type MetricsSortDir, type MetricsSortKey, sortScoreNames } from "@/components/evaluation/metrics-panel/utils";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

interface ListDetailViewProps {
  scoreNames: string[];
  selectedScore?: string;
  setSelectedScore: (s: string) => void;
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  isComparison?: boolean;
  isLoading?: boolean;
  density?: MetricRowDensity;
  binaryStyle?: BinaryStyle;
  sortKey?: MetricsSortKey;
  sortDir?: MetricsSortDir;
}

export default function ListDetailView({
  scoreNames,
  selectedScore,
  setSelectedScore,
  allStatistics,
  allDistributions,
  comparedAllStatistics,
  comparedAllDistributions,
  isComparison,
  isLoading,
  density = "full",
  binaryStyle,
  sortKey = "name",
  sortDir = "asc",
}: ListDetailViewProps) {
  const ordered = useMemo(
    () => sortScoreNames(scoreNames, sortKey, sortDir, allStatistics, comparedAllStatistics, allDistributions),
    [scoreNames, sortKey, sortDir, allStatistics, comparedAllStatistics, allDistributions]
  );
  const dist = selectedScore ? (allDistributions?.[selectedScore] ?? null) : null;
  const cDist = selectedScore ? (comparedAllDistributions?.[selectedScore] ?? null) : null;

  return (
    <ResizablePanelGroup id="metrics-list-detail" orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={"30%"} minSize={"20%"} className="overflow-hidden">
        <ScrollArea className="h-full">
          {/* Padding INSIDE the scroll viewport (matches Figma p-[12px]) so cards
              have breathing room as they scroll; the styled scrollbar sits flush
              to the panel edge. */}
          <div className={cn("p-3 flex flex-col", density === "compact" ? "gap-px" : "gap-2")}>
            {ordered.map((name) => (
              <MetricRow
                key={name}
                name={name}
                statistics={allStatistics?.[name] ?? null}
                comparedStatistics={comparedAllStatistics?.[name] ?? null}
                distribution={allDistributions?.[name] ?? null}
                comparedDistribution={comparedAllDistributions?.[name] ?? null}
                isComparison={isComparison}
                selected={name === selectedScore}
                onClick={() => setSelectedScore(name)}
                density={density}
                binaryStyle={binaryStyle}
              />
            ))}
          </div>
        </ScrollArea>
      </ResizablePanel>
      <ResizableHandle className="bg-transparent hover:bg-border/60 transition-colors" />
      <ResizablePanel defaultSize={"70%"} minSize={"30%"}>
        <div className="h-full flex items-center justify-center p-4">
          <SmartViz
            scoreName={selectedScore}
            distribution={dist}
            comparedDistribution={cDist}
            isComparison={isComparison}
            isLoading={isLoading}
            binaryStyle={binaryStyle}
            className="w-full"
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
