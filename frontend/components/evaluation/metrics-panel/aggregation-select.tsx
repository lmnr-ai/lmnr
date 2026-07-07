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

export function AggregationSelect() {
  const [aggregation, setAggregation] = useAggregation();
  return (
    <Select value={aggregation} onValueChange={(v) => setAggregation(v as AggregationKind)}>
      <SelectTrigger className="h-7 w-fit gap-1 text-xs bg-secondary text-secondary-foreground">
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
