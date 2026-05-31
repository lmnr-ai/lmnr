"use client";

import { parseAsStringEnum, useQueryState } from "nuqs";

import {
  AGGREGATION_OPTIONS,
  type AggregationKind,
  DEFAULT_AGGREGATION,
} from "@/components/evaluation/metrics-panel/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const AGG_VALUES = AGGREGATION_OPTIONS.map((o) => o.value) as AggregationKind[];

export function useAggregation() {
  return useQueryState("agg", parseAsStringEnum<AggregationKind>(AGG_VALUES).withDefault(DEFAULT_AGGREGATION));
}

interface AggregationSelectProps {
  hidden?: boolean;
}

export function AggregationSelect({ hidden }: AggregationSelectProps) {
  const [aggregation, setAggregation] = useAggregation();
  if (hidden) return null;
  return (
    <Select value={aggregation} onValueChange={(v) => setAggregation(v as AggregationKind)}>
      <SelectTrigger className="h-7 w-[120px] text-xs bg-secondary">
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
  );
}
