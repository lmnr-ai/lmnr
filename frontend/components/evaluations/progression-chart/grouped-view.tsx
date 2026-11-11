"use client";

import { useMemo, useState } from "react";

import { type ChartConfig } from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocalStorage } from "@/hooks/use-local-storage.tsx";

import CombinedLegend from "./combined-legend";
import GroupedBreakdownChart from "./grouped-breakdown-chart";
import GroupedTrendChart from "./grouped-trend-chart";
import { buildGrouping } from "./grouping";
import ScorePicker from "./score-picker";
import { type ProgressionPoint, type ProgressionView } from "./shared";

interface GroupedViewProps {
  points: ProgressionPoint[];
  groupBy: string;
  view: ProgressionView;
  scoreKeys: string[];
  visibleScores: string[];
  onToggleScore: (score: string) => void;
  /** `<projectId>:<groupId>`, scopes the persisted legend and score choices. */
  prefsKey: string;
  hoveredEvaluationId?: string;
  onPointClick?: (evaluationId: string) => void;
}

const SCORE_LEGEND_COLOR = "var(--color-muted-foreground)";
const EMPTY_GROUPS: string[] = [];
const COLLAPSED_GROUP_COUNT = 10;

export default function GroupedView({
  points,
  groupBy,
  view,
  scoreKeys,
  visibleScores,
  onToggleScore,
  prefsKey,
  hoveredEvaluationId,
  onPointClick,
}: GroupedViewProps) {
  // Hidden (not shown) set, so values that appear in new runs default to visible.
  const [hiddenGroups, setHiddenGroups] = useLocalStorage<string[]>(
    `evaluations-chart-hidden-groups:${prefsKey}:${groupBy}`,
    EMPTY_GROUPS
  );
  const [pickedScore, setPickedScore] = useLocalStorage<string | null>(
    `evaluations-chart-trend-score:${prefsKey}`,
    null
  );
  const [showAllGroups, setShowAllGroups] = useState(false);
  const toggleGroup = (label: string) =>
    setHiddenGroups((prev) => (prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]));
  const trendScore = pickedScore && scoreKeys.includes(pickedScore) ? pickedScore : scoreKeys[0];

  const grouping = useMemo(() => buildGrouping(points, groupBy), [points, groupBy]);
  const shownGroups = useMemo(
    () => grouping.groups.filter((g) => !hiddenGroups.includes(g.label)),
    [grouping.groups, hiddenGroups]
  );
  const shownPoints = useMemo(() => {
    const shown = new Set(shownGroups.map((g) => g.label));
    return points
      .filter((p) => shown.has(grouping.groupByEvalId[p.evaluationId]))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [points, grouping.groupByEvalId, shownGroups]);

  const groupConfig = useMemo<ChartConfig>(
    () => Object.fromEntries(grouping.groups.map((g) => [g.label, { label: g.label, color: g.color }])),
    [grouping.groups]
  );
  const scoreConfig = useMemo<ChartConfig>(
    () => Object.fromEntries(scoreKeys.map((s) => [s, { label: s, color: SCORE_LEGEND_COLOR }])),
    [scoreKeys]
  );

  return (
    <div className="flex flex-1 gap-3 min-h-0 min-w-0 rounded-[4px] border border-border bg-secondary px-4 py-3">
      {/* Radix wraps viewport content in a display:table div that ignores the width; block keeps truncation working. */}
      <ScrollArea className="w-40 shrink-0" viewportClassName="[&>div]:block!">
        <div className="flex flex-col gap-3 pr-2.5">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground truncate" title={groupBy}>
              {groupBy}
            </span>
            <CombinedLegend
              scores={grouping.groups.slice(0, showAllGroups ? undefined : COLLAPSED_GROUP_COUNT).map((g) => g.label)}
              visibleScores={shownGroups.map((g) => g.label)}
              chartConfig={groupConfig}
              onToggle={toggleGroup}
            />
            {grouping.groups.length > COLLAPSED_GROUP_COUNT && (
              <button
                type="button"
                onClick={() => setShowAllGroups((v) => !v)}
                className="text-left text-xs text-muted-foreground hover:text-foreground"
              >
                {showAllGroups ? "Show less" : `Show ${grouping.groups.length - COLLAPSED_GROUP_COUNT} more`}
              </button>
            )}
          </div>
          {view === "breakdown" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Scores</span>
              <CombinedLegend
                scores={scoreKeys}
                visibleScores={visibleScores}
                chartConfig={scoreConfig}
                onToggle={onToggleScore}
              />
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-2">
        {view === "trend" ? (
          <>
            {trendScore && <ScorePicker scores={scoreKeys} selected={trendScore} onSelect={setPickedScore} />}
            <div className="flex-1 min-h-0">
              {trendScore && (
                <GroupedTrendChart
                  score={trendScore}
                  points={shownPoints}
                  groupByEvalId={grouping.groupByEvalId}
                  groups={shownGroups}
                  hoveredEvaluationId={hoveredEvaluationId}
                  onPointClick={onPointClick}
                />
              )}
            </div>
          </>
        ) : (
          <GroupedBreakdownChart
            scores={visibleScores}
            points={shownPoints}
            groupByEvalId={grouping.groupByEvalId}
            groups={shownGroups}
          />
        )}
      </div>
    </div>
  );
}
