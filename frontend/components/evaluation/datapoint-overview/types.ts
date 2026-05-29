import { type Evaluation as EvaluationType } from "@/lib/evaluation/types";

export type ComparisonRow = {
  evaluationId: string;
  index: number;
  scores: Record<string, number>;
};

export type ComparisonResponse = {
  rows: ComparisonRow[];
};

export type OverviewVariant = "grid" | "hero" | "rail" | "table" | "radar";

export const OVERVIEW_VARIANTS: OverviewVariant[] = ["grid", "hero", "rail", "table", "radar"];

/** Shared props every variant component receives. */
export interface VariantProps {
  scoreNames: string[];
  currentEvaluationId: string;
  evaluations: EvaluationType[];
  rows: ComparisonRow[];
}
