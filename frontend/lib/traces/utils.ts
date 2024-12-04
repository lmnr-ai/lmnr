import { SpanMetricGroupBy } from '../clickhouse/spans';
import { DatatableFilter } from '../types';
import { SpanType } from './types';

export const SPAN_TYPE_TO_COLOR = {
  [SpanType.DEFAULT]: 'rgba(96, 165, 250, 0.7)', // 70% opacity blue
  [SpanType.LLM]: 'rgba(124, 58, 237, 0.7)', // 70% opacity purple
  [SpanType.EXECUTOR]: 'rgba(245, 158, 11, 0.7)', // 70% opacity yellow
  [SpanType.EVALUATOR]: 'rgba(6, 182, 212, 0.7)', // 70% opacity cyan
  [SpanType.EVALUATION]: 'rgba(16, 185, 129, 0.7)' // 70% opacity green
};

const buildFilters = (groupBy: SpanMetricGroupBy, value: string): DatatableFilter[] => [
  {
    column: groupBy,
    operator: 'eq',
    value,
  }
];

export const buildSpansUrl = (
  projectId: string,
  aggregation: SpanMetricGroupBy,
  value: string,
  pastHours?: string,
  startDate?: string,
  endDate?: string,
): string => {
  const filters = buildFilters(aggregation, value);
  const timeRangeParam = pastHours
    ? `&pastHours=${pastHours}`
    : `&startDate=${startDate}&endDate=${endDate}`;
  return `/project/${projectId}/traces?view=spans&filter=${JSON.stringify(filters)}${timeRangeParam}`;
};
