export type TracesStatsDataPoint = {
  timestamp: string;
  successCount: number;
  errorCount: number;
} & Record<string, number>;
