export interface ProgressionPoint {
  timestamp: string;
  evaluationId: string;
  name: string;
  values: Record<string, number | null>;
}

export type ChartVariant = "grouped" | "split" | "combined";
