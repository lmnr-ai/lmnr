import { SpanType } from "./types";

// Hue tokens live in app/globals.css (--{hue}-icon-background); only the span type → hue choice is made here.
export const SPAN_TYPE_TO_COLOR = {
  [SpanType.DEFAULT]: "var(--blue-icon-background)",
  [SpanType.LLM]: "var(--purple-icon-background)",
  [SpanType.EXECUTOR]: "var(--yellow-icon-background)",
  [SpanType.EVALUATOR]: "var(--cyan-icon-background)",
  [SpanType.EVALUATION]: "var(--green-icon-background)",
  [SpanType.HUMAN_EVALUATOR]: "var(--pink-icon-background)",
  [SpanType.TOOL]: "var(--yellow-icon-background)",
  [SpanType.EVENT]: "var(--red-icon-background)",
  [SpanType.CACHED]: "var(--purple-icon-background)",
};

export const SPAN_ERROR_COLOR = "var(--red-icon-background)";

// If the span hadn't arrived in one hour, it's probably not going to arrive.
const MILLISECONDS_DATE_THRESHOLD = 1000 * 60 * 60; // 1 hour

export const isStringDateOld = (date: string) => {
  const d = new Date(date);
  return d < new Date(Date.now() - MILLISECONDS_DATE_THRESHOLD);
};
