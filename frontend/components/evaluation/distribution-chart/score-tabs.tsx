import { Badge } from "@/components/ui/badge";
import { type EvaluationScoreAnalysis } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

import { formatNumber, formatPercent } from "./utils";

interface ScoreTabsProps {
  scoreNames: string[];
  analyses: Record<string, EvaluationScoreAnalysis | undefined>;
  selected?: string;
  onSelect: (name: string) => void;
}

const typeLabel = (t: EvaluationScoreAnalysis["type"]): string => t;

/**
 * One tab per score name. Each tab shows the score name, its summary
 * number (pass rate for binary / mean for others), and a type chip.
 *
 * We keep the chart object stable across tab switches (see the task spec)
 * — the consumer renders one chart at the bottom and just feeds it the
 * selected analysis. Tabs only drive `selected`.
 */
export default function ScoreTabs({ scoreNames, analyses, selected, onSelect }: ScoreTabsProps) {
  return (
    <div className="flex flex-row flex-wrap gap-1 overflow-x-auto">
      {scoreNames.map((name) => {
        const analysis = analyses[name];
        const isActive = selected === name;
        const summary =
          analysis?.type === "binary"
            ? formatPercent(analysis.stats.passRate)
            : analysis
              ? formatNumber(analysis.stats.mean)
              : "–";
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            aria-pressed={isActive}
            className={cn(
              "group flex items-center gap-2 rounded-md border px-3 py-1.5 text-left transition-colors",
              "text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-background border-border shadow-sm"
                : "bg-transparent border-transparent hover:bg-muted/50 text-muted-foreground"
            )}
          >
            <span className={cn("font-medium truncate max-w-[180px]", isActive && "text-foreground")}>{name}</span>
            <span className={cn("font-mono tabular-nums", isActive ? "text-foreground" : "text-muted-foreground")}>
              {summary}
            </span>
            {analysis && (
              <Badge variant="outline" className="h-4 px-1 text-[10px] leading-none">
                {typeLabel(analysis.type)}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
