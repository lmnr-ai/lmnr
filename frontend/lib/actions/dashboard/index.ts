import { z } from "zod/v4";

import { GroupByInterval } from "@/lib/clickhouse/modifiers";
import {
  getLabelMetricsOverTime,
  getSpanMetricsOverTime,
  getSpanMetricsSummary,
  getTraceMetricsOverTime,
  getTraceStatusMetricsOverTime,
} from "@/lib/clickhouse/spans";
import { AggregationFunction, SpanMetric, SpanMetricGroupBy, TraceMetric } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";

const BaseMetricsSchema = z.object({
  projectId: z.string(),
  pastHours: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
});

const OptionalGroupByIntervalSchema = z.object({
  groupByInterval: z.enum(GroupByInterval).optional().default(GroupByInterval.Hour),
});

const SpanGroupBySchema = z.object({
  groupBy: z.enum(SpanMetricGroupBy),
});

export const GetSpanMetricsTimeSchema = BaseMetricsSchema.extend({
  metric: z.enum(SpanMetric),
  aggregation: z.enum(AggregationFunction),
  groupByInterval: z.enum(GroupByInterval),
}).extend(SpanGroupBySchema.shape);

export const GetSpanMetricsSummarySchema = BaseMetricsSchema.extend({
  metric: z.enum(SpanMetric),
  aggregation: z.enum(AggregationFunction),
}).extend(SpanGroupBySchema.shape);

export const GetLabelMetricsSchema = BaseMetricsSchema.extend(OptionalGroupByIntervalSchema.shape);

export const GetTraceMetricsSchema = BaseMetricsSchema.extend({
  metric: z.enum(TraceMetric),
  aggregation: z.enum(AggregationFunction),
}).extend(OptionalGroupByIntervalSchema.shape);

export const GetTraceStatusMetricsSchema = BaseMetricsSchema.extend(OptionalGroupByIntervalSchema.shape);

export async function getSpanMetricsOverTimeAction(input: z.infer<typeof GetSpanMetricsTimeSchema>) {
  const { projectId, metric, aggregation, groupByInterval, groupBy, pastHours, startDate, endDate } =
    GetSpanMetricsTimeSchema.parse(input);

  console.log("span metrics over time", input);
  const timeRange = getTimeRange(pastHours || undefined, startDate || undefined, endDate || undefined);
  const metrics = await getSpanMetricsOverTime(projectId, metric, groupByInterval, timeRange, groupBy, aggregation);

  return metrics;
}

export async function getSpanMetricsSummaryAction(input: z.infer<typeof GetSpanMetricsSummarySchema>) {
  const { projectId, metric, aggregation, groupBy, pastHours, startDate, endDate } =
    GetSpanMetricsSummarySchema.parse(input);

  const timeRange = getTimeRange(pastHours || undefined, startDate || undefined, endDate || undefined);
  const metrics = await getSpanMetricsSummary(projectId, metric, timeRange, groupBy, aggregation);

  return metrics;
}

export async function getLabelMetricsAction(input: z.infer<typeof GetLabelMetricsSchema>) {
  const { projectId, groupByInterval, pastHours, startDate, endDate } = GetLabelMetricsSchema.parse(input);

  const timeRange = getTimeRange(pastHours || undefined, startDate || undefined, endDate || undefined);
  const metrics = await getLabelMetricsOverTime(projectId, groupByInterval, timeRange);

  return metrics;
}

export async function getTraceMetricsAction(input: z.infer<typeof GetTraceMetricsSchema>) {
  const { projectId, metric, aggregation, groupByInterval, pastHours, startDate, endDate } =
    GetTraceMetricsSchema.parse(input);

  console.log("trace metrics over time", input);

  const timeRange = getTimeRange(pastHours || undefined, startDate || undefined, endDate || undefined);
  const metrics = await getTraceMetricsOverTime(projectId, metric, groupByInterval, timeRange, aggregation);

  return metrics;
}

export async function getTraceStatusMetricsAction(input: z.infer<typeof GetTraceStatusMetricsSchema>) {
  const { projectId, groupByInterval, pastHours, startDate, endDate } = GetTraceStatusMetricsSchema.parse(input);

  const timeRange = getTimeRange(pastHours || undefined, startDate || undefined, endDate || undefined);
  const metrics = await getTraceStatusMetricsOverTime(projectId, groupByInterval, timeRange);

  return metrics;
}
