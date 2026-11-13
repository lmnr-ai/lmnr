export interface ProgressionPoint {
  timestamp: string;
  evaluationId: string;
  name: string;
  values: Record<string, number | null>;
  metadata?: Record<string, unknown> | null;
}

export type ProgressionView = "trend" | "breakdown";

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toFixed(3);
}
