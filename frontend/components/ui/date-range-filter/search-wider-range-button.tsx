"use client";

import { differenceInHours } from "date-fns";

import { Button } from "@/components/ui/button";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { Feature } from "@/lib/features/features";

import { type DateRange, getNextQuickRange } from "./utils";

interface SearchWiderRangeButtonProps {
  pastHours?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  onSelect: (range: DateRange) => void;
}

export default function SearchWiderRangeButton({
  pastHours,
  startDate,
  endDate,
  onSelect,
}: SearchWiderRangeButtonProps) {
  const { project } = useProjectContext();
  const featureFlags = useFeatureFlags();
  const retentionDays = featureFlags[Feature.SUBSCRIPTION] ? project?.logRetentionDays : null;
  const maxHours = retentionDays != null ? retentionDays * 24 : undefined;

  const currentHours = pastHours
    ? parseInt(pastHours, 10)
    : startDate && endDate
      ? differenceInHours(new Date(endDate), new Date(startDate))
      : 24;
  const nextRange = Number.isNaN(currentHours) ? undefined : getNextQuickRange(currentHours, maxHours);

  if (!nextRange) return null;

  return (
    <Button variant="outline" className="text-secondary-foreground" onClick={() => onSelect(nextRange)}>
      Search last {nextRange.name.replace(/^1 /, "")}
    </Button>
  );
}
