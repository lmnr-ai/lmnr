"use client";

import { DataTableComponent } from "./data-table";
import { ErrorAnalysisCard } from "./error-analysis";
import { EvalScoreCardComponent } from "./eval-score-card";
import { MetricsCardComponent } from "./metrics-card";
import { SpanTimelineComponent } from "./span-timeline";
import { TraceSummaryCard } from "./trace-summary";
import type {
  DataTableData,
  ErrorAnalysisData,
  EvalScoreCardData,
  MetricsCardData,
  SpanTimelineData,
  TraceSummaryData,
} from "./types";

export type {
  DataTableData,
  ErrorAnalysisData,
  EvalScoreCardData,
  MetricsCardData,
  SpanTimelineData,
  TraceSummaryData,
};

// Component registry mapping tool names to their render components
// Inspired by json-render: the AI generates structured JSON, which is rendered
// by pre-defined React components for rich, interactive UI
export const RENDER_COMPONENT_REGISTRY: Record<string, React.ComponentType<{ data: any }>> = {
  renderTraceSummary: TraceSummaryCard,
  renderMetrics: MetricsCardComponent,
  renderSpanTimeline: SpanTimelineComponent,
  renderErrorAnalysis: ErrorAnalysisCard,
  renderDataTable: DataTableComponent,
  renderEvalScoreCard: EvalScoreCardComponent,
};

export {
  DataTableComponent,
  ErrorAnalysisCard,
  EvalScoreCardComponent,
  MetricsCardComponent,
  SpanTimelineComponent,
  TraceSummaryCard,
};
