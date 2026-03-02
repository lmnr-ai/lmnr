"use client";

import { DiffView, type DiffViewData } from "./diff-view";
import { ErrorSummary, type ErrorSummaryData } from "./error-summary";
import { MetricsTable, type MetricsTableData } from "./metrics-table";
import { SpanBreakdown, type SpanBreakdownData } from "./span-breakdown";
import { TraceCard, type TraceCardData } from "./trace-card";

export type WidgetData =
  | { type: "traceCard"; data: TraceCardData }
  | { type: "diffView"; data: DiffViewData }
  | { type: "spanBreakdown"; data: SpanBreakdownData }
  | { type: "metricsTable"; data: MetricsTableData }
  | { type: "errorSummary"; data: ErrorSummaryData };

export function ChatWidget({ widget }: { widget: WidgetData }) {
  switch (widget.type) {
    case "traceCard":
      return <TraceCard data={widget.data} />;
    case "diffView":
      return <DiffView data={widget.data} />;
    case "spanBreakdown":
      return <SpanBreakdown data={widget.data} />;
    case "metricsTable":
      return <MetricsTable data={widget.data} />;
    case "errorSummary":
      return <ErrorSummary data={widget.data} />;
    default:
      return null;
  }
}

// Tool name -> widget type mapping
export const TOOL_TO_WIDGET_TYPE: Record<string, WidgetData["type"]> = {
  renderTraceCard: "traceCard",
  renderDiffView: "diffView",
  renderSpanBreakdown: "spanBreakdown",
  renderMetricsTable: "metricsTable",
  renderErrorSummary: "errorSummary",
};

export { DiffView, ErrorSummary, MetricsTable, SpanBreakdown, TraceCard };
export type { DiffViewData, ErrorSummaryData, MetricsTableData, SpanBreakdownData, TraceCardData };
