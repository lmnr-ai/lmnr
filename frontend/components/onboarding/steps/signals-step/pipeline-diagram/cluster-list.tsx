import WarningIcon from "@/components/onboarding/steps/signals-step/pipeline-diagram/warning-icon";
import { cn } from "@/lib/utils";

// One colour per cluster so they read as distinct categories, unlike the uniform events.
const CLUSTER_COLORS = ["text-red-400", "text-amber-400", "text-violet-400", "text-emerald-400"];
const CLUSTER_COUNT = CLUSTER_COLORS.length;
// Cluster each arriving event lands in, interleaved so all counts climb together.
// Final tallies match the design: 2 / 5 / 8 / 3.
const ASSIGNMENTS = [2, 1, 2, 3, 0, 2, 1, 2, 3, 1, 2, 0, 2, 1, 3, 2, 1, 2];
// Fraction of an arrival during which the cluster that just grew stays highlighted.
const HIGHLIGHT_WINDOW = 0.6;

export const CLASSIFIED_EVENT_COUNT = ASSIGNMENTS.length;

interface ClusterListProps {
  // Fractional number of events classified so far; may exceed the total.
  classified: number;
}

export default function ClusterList({ classified }: ClusterListProps) {
  const arrived = Math.floor(classified);
  const counts = Array<number>(CLUSTER_COUNT).fill(0);
  ASSIGNMENTS.slice(0, arrived).forEach((cluster) => counts[cluster]++);
  // `classified` runs past the total so the final highlight clears like the rest.
  const highlighting = arrived > 0 && arrived <= ASSIGNMENTS.length && classified - arrived < HIGHLIGHT_WINDOW;
  const justLanded = highlighting ? ASSIGNMENTS[arrived - 1] : null;

  return (
    <div className="flex h-30 w-14 flex-col gap-0.5">
      {counts.map((count, i) => (
        <div key={i} className="flex min-h-0 flex-1">
          <div className="flex w-7 items-center justify-center bg-surface-600">
            <WarningIcon className={CLUSTER_COLORS[i]} markClassName="fill-surface-600" />
          </div>
          <div
            className={cn(
              "flex w-7 items-center justify-center bg-surface-550 text-base tabular-nums transition-colors duration-200",
              justLanded === i ? "text-foreground" : "text-foreground-300"
            )}
          >
            {count > 0 ? count : "-"}
          </div>
        </div>
      ))}
    </div>
  );
}
