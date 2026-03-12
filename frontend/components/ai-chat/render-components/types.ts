// Types for the AI chat render components
// Inspired by json-render: AI generates structured JSON data, rendered by predefined components

export interface TraceSummaryData {
  traceId: string;
  status: "success" | "error" | "partial";
  startTime: string;
  endTime: string;
  totalSpans: number;
  errorCount: number;
  topLevelSpans: {
    name: string;
    spanId: string;
    status: string;
    durationMs: number;
  }[];
  totalTokens?: number;
  totalCost?: number;
  summary: string;
}

export interface MetricsCardData {
  title: string;
  metrics: {
    label: string;
    value: number | string;
    format?: "number" | "currency" | "percent" | "duration" | "tokens";
    change?: number; // percentage change from previous period
    description?: string;
  }[];
}

export interface SpanTimelineData {
  traceId: string;
  totalDurationMs: number;
  spans: {
    spanId: string;
    name: string;
    startOffsetMs: number;
    durationMs: number;
    status: "success" | "error" | "pending";
    depth: number;
    spanType?: string;
  }[];
}

export interface ErrorAnalysisData {
  totalErrors: number;
  timeRange: string;
  errors: {
    message: string;
    count: number;
    firstSeen: string;
    lastSeen: string;
    spanName?: string;
    severity: "critical" | "error" | "warning";
  }[];
  summary: string;
}

export interface DataTableData {
  title: string;
  columns: {
    key: string;
    label: string;
    format?: "text" | "number" | "currency" | "duration" | "date" | "badge";
  }[];
  rows: Record<string, string | number | boolean | null>[];
  totalRows?: number;
  query?: string;
}

export interface EvalScoreCardData {
  evaluationName: string;
  evaluationId: string;
  scores: {
    name: string;
    average: number;
    min: number;
    max: number;
    median: number;
    distribution: { bucket: string; count: number }[];
  }[];
  totalDatapoints: number;
  summary: string;
}
