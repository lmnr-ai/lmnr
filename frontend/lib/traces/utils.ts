import { SpanType } from "./types";

export const SPAN_TYPE_TO_COLOR = {
  [SpanType.DEFAULT]: "rgba(96, 165, 250, 0.7)", // 70% opacity blue
  [SpanType.LLM]: "hsl(var(--llm))", // 90% opacity purple
  [SpanType.EXECUTOR]: "rgba(245, 158, 11, 0.7)", // 70% opacity yellow
  [SpanType.EVALUATOR]: "rgba(6, 182, 212, 0.7)", // 70% opacity cyan
  [SpanType.EVALUATION]: "rgba(16, 185, 129, 0.7)", // 70% opacity green
  [SpanType.HUMAN_EVALUATOR]: "rgba(244, 114, 182, 0.7)",
  [SpanType.TOOL]: "rgba(227, 160, 8, 0.9)",
  [SpanType.EVENT]: "rgba(204, 51, 51, 0.7)",
};


// If the span hadn't arrived in one hour, it's probably not going to arrive.
const MILLISECONDS_DATE_THRESHOLD = 1000 * 60 * 60; // 1 hour

export const isStringDateOld = (date: string) => {
  const d = new Date(date);
  return d < new Date(Date.now() - MILLISECONDS_DATE_THRESHOLD);
};
