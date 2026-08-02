import { type ScoreAggregation } from "@/lib/evaluation/aggregation";
import { isValidNumber } from "@/lib/utils";

export type AggregationKind = ScoreAggregation;

export const AGGREGATION_OPTIONS: { value: AggregationKind; label: string }[] = [
  { value: "avg", label: "Average" },
  { value: "sum", label: "Sum" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "median", label: "Median" },
  { value: "p90", label: "p90" },
  { value: "p95", label: "p95" },
  { value: "p99", label: "p99" },
];

export const DEFAULT_AGGREGATION: AggregationKind = "avg";

export function pctChange(current: number, base: number): number | null {
  if (!isValidNumber(current) || !isValidNumber(base) || base === 0) return null;
  return ((current - base) / base) * 100;
}
