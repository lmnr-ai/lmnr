"use client";

import { type ReactNode, useState } from "react";

import IssueCards from "@/components/evaluation/poc/issues/issue-cards";
import IssueChips from "@/components/evaluation/poc/issues/issue-chips";
import IssuesBanner from "@/components/evaluation/poc/issues/issues-banner";
import { type AssignedIssueCluster } from "@/components/evaluation/poc/issues/mock-issues";
import ScoreHoverChips from "@/components/evaluation/poc/score-hover-chips";
import { type PocTopMode } from "@/components/evaluation/poc/use-poc-top";
import { Button } from "@/components/ui/button";
import { type EvaluationScoreDistributionBucket, type EvaluationScoreStatistics } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

interface TopAreaProps {
  scoreNames: string[];
  selectedScore?: string;
  setSelectedScore: (s: string) => void;
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  allDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllDistributions?: Record<string, EvaluationScoreDistributionBucket[]>;
  isComparison?: boolean;
  isLoading?: boolean;
  topMode: PocTopMode;
  clusters: AssignedIssueCluster[];
  selectedIssueId: string | null;
  onToggleIssue: (id: string) => void;
}

/**
 * Composes the resting score-chips row with the selected issues top mode
 * (Round 6). Compact-v1 only; clusters are index-keyed and score-independent,
 * so the issues modes work in comparison mode too — silently no-op-ing there
 * made the top-area switcher look broken. `rail` mode intentionally renders
 * nothing extra here: the rail sits beside the table, not above it, and is
 * placed directly by evaluation.tsx.
 */
export default function TopArea({
  scoreNames,
  selectedScore,
  setSelectedScore,
  allStatistics,
  allDistributions,
  comparedAllStatistics,
  comparedAllDistributions,
  isComparison,
  isLoading,
  topMode,
  clusters,
  selectedIssueId,
  onToggleIssue,
}: TopAreaProps) {
  const [activeTab, setActiveTab] = useState<"scores" | "issues">("scores");

  const metrics = (
    <ScoreHoverChips
      scoreNames={scoreNames}
      selectedScore={selectedScore}
      onSelectScore={setSelectedScore}
      allStatistics={allStatistics}
      allDistributions={allDistributions}
      comparedAllStatistics={comparedAllStatistics}
      comparedAllDistributions={comparedAllDistributions}
      isComparison={isComparison}
      isLoading={isLoading}
    />
  );

  if (topMode === "scores" || clusters.length === 0) {
    return metrics;
  }

  if (topMode === "tabs") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex w-fit gap-0.5 rounded-md border bg-secondary p-0.5">
          <TabButton active={activeTab === "scores"} onClick={() => setActiveTab("scores")}>
            Scores
          </TabButton>
          <TabButton active={activeTab === "issues"} onClick={() => setActiveTab("issues")}>
            Issues ({clusters.length})
          </TabButton>
        </div>
        {activeTab === "scores" ? (
          metrics
        ) : (
          <IssueCards clusters={clusters} selectedId={selectedIssueId} onToggle={onToggleIssue} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {metrics}
      {topMode === "chips" && <IssueChips clusters={clusters} selectedId={selectedIssueId} onToggle={onToggleIssue} />}
      {topMode === "banner" && (
        <IssuesBanner clusters={clusters} selectedId={selectedIssueId} onToggle={onToggleIssue} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="sm"
      onClick={onClick}
      className={cn("h-6 px-2.5 text-xs", active && "bg-background shadow-sm")}
    >
      {children}
    </Button>
  );
}
