"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { type MetricRuleInput, type PreviewGroup } from "@/lib/actions/alerts/metric-rule";

import { NOISY_FIRES_PER_WEEK, PREVIEW_HOURS } from "../constants";
import RuleChart from "../rule-chart";
import { useRulePreview } from "../use-rule-requests";
import RuleSentence from "./rule-sentence";

interface PreviewStepProps {
  projectId: string;
  rule: MetricRuleInput;
  alertId?: string;
}

const times = (count: number) => (count === 1 ? "1 time" : `${count} times`);

/** Counted the way the total is: every time an incident opens, reopening included. */
const fires = (group: PreviewGroup) =>
  group.incidents
    .flatMap((incident) => incident.transitions)
    .filter((transition) => transition.kind === "opened" || transition.kind === "reopened").length;

/** Replays the rule on the last 7 days, so a noisy rule is caught before it is saved. */
export default function PreviewStep({ projectId, rule, alertId }: PreviewStepProps) {
  const { preview, error, isLoading } = useRulePreview(projectId, rule, {
    hours: PREVIEW_HOURS,
    alertId,
    debounce: true,
  });
  const [selected, setSelected] = useState<string | null>(null);

  if (error) return <p className="rounded-md border p-3 text-sm text-destructive-text">{error}</p>;
  if (!preview) return <Skeleton className="h-64 w-full" />;

  const group = preview.groups.find((g) => g.group === selected) ?? preview.groups[0];
  const noisy = preview.firedCount > NOISY_FIRES_PER_WEEK;

  return (
    <div className="flex flex-col gap-4" aria-busy={isLoading}>
      <RuleSentence rule={rule} />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm">
          Would have fired <span className="font-semibold">{times(preview.firedCount)}</span> in the last 7 days.
        </p>
        {preview.groups.length > 1 && group && (
          <Select value={group.group} onValueChange={setSelected}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {preview.groups.map((g) => (
                <SelectItem key={g.group} value={g.group}>
                  {g.group} ({times(fires(g))})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {noisy && (
        <div className="flex gap-2 rounded-md border border-orange-400/40 p-3 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-orange-400" />
          <p>
            That is more than {NOISY_FIRES_PER_WEEK} times a week, which is likely to be ignored. Try a longer window, a
            minimum change, or more checks in a row.
          </p>
        </div>
      )}
      {group && group.points.length > 0 ? (
        <RuleChart rule={rule} group={group} className="h-64" />
      ) : (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No data in the last 7 days.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        The line is the value held against the thresholds. Shaded spans are incidents the rule would have opened.
      </p>
    </div>
  );
}
