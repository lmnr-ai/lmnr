import { SpanType } from "./types";

export const SPAN_TYPE_TO_COLOR = {
  [SpanType.DEFAULT]: "rgba(100, 160, 230, 0.7)",
  [SpanType.LLM]: "hsl(var(--llm))",
  [SpanType.EXECUTOR]: "rgba(200, 150, 50, 0.7)",
  [SpanType.EVALUATOR]: "rgba(60, 170, 190, 0.7)",
  [SpanType.EVALUATION]: "rgba(60, 170, 130, 0.7)",
  [SpanType.HUMAN_EVALUATOR]: "rgba(200, 120, 165, 0.7)",
  [SpanType.TOOL]: "rgba(200, 155, 50, 0.85)",
  [SpanType.EVENT]: "rgba(190, 70, 70, 0.7)",
  [SpanType.CACHED]: "hsl(var(--llm))",
};

// If the span hadn't arrived in one hour, it's probably not going to arrive.
const MILLISECONDS_DATE_THRESHOLD = 1000 * 60 * 60; // 1 hour

export const isStringDateOld = (date: string) => {
  const d = new Date(date);
  return d < new Date(Date.now() - MILLISECONDS_DATE_THRESHOLD);
};
