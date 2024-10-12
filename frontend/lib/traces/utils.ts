import { SpanType } from './types';

export const SPAN_TYPE_TO_COLOR = {
  [SpanType.DEFAULT]: 'rgba(96, 165, 250, 0.7)', // 70% opacity blue
  [SpanType.LLM]: 'rgba(124, 58, 237, 0.7)', // 70% opacity purple
  [SpanType.EXECUTOR]: 'rgba(245, 158, 11, 0.7)', // 70% opacity yellow
  [SpanType.EVALUATOR]: 'rgba(6, 182, 212, 0.7)', // 70% opacity cyan
  [SpanType.EVALUATION]: 'rgba(16, 185, 129, 0.7)', // 70% opacity green
};
