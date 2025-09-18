import { groupBy } from "lodash";
import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { cache, TRACE_CHATS_CACHE_KEY } from "@/lib/cache";
import { convertToLocalTimeWithMillis, tryParseJson } from "@/lib/utils";

import { GetTraceStructureSchema } from ".";
import { deduplicateSpanContent, replaceBase64ImagesInSpans } from "./utils";

const ClickHouseToCacheSpanSchema = z.object({
  span_id: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  name: z.string(),
  span_type: z.string(),
  input_cost: z.number(),
  output_cost: z.number(),
  total_cost: z.number(),
  model: z.string(),
  trace_id: z.string(),
  provider: z.string(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
  path: z.string(),
  input: z.string(),
  output: z.string(),
  status: z.string(),
  attributes: z.string(),
  request_model: z.string(),
  response_model: z.string(),
  parent_span_id: z.string(),
  events: z.array(z.object({
    timestamp: z.string(),
    name: z.string(),
    attributes: z.string(),
  })),
}).transform((span) => {
  let input = span.input;
  let output = span.output;
  try {
    input = JSON.parse(input);
  } catch { };
  try {
    output = JSON.parse(output);
  } catch { };
  return {
    spanId: span.span_id,
    type: span.span_type,
    start: convertToLocalTimeWithMillis(span.start_time),
    end: convertToLocalTimeWithMillis(span.end_time),
    parent: span.parent_span_id,
    name: span.name,
    status: span.status === "error" ? "error" : "success",
    attributes: tryParseJson(span.attributes),
    input,
    output,
    requestModel: span.request_model,
    responseModel: span.response_model,
    inputCost: span.input_cost,
    outputCost: span.output_cost,
    totalCost: span.total_cost,
    inputTokens: span.input_tokens,
    outputTokens: span.output_tokens,
    totalTokens: span.total_tokens,
    model: span.model,
    traceId: span.trace_id,
    provider: span.provider,
    path: span.path,
    events: span.events.map((event) => ({
      timestamp: convertToLocalTimeWithMillis(event.timestamp),
      name: event.name,
      attributes: JSON.parse(event.attributes) as Record<string, any>,
    })),
  };
});

interface SpanEvent {
  timestamp: string,
  name: string,
  attributes: Record<string, any>,
}

const isErrorEvent = (event: SpanEvent) => event.name === "exception" && Object.keys(event.attributes).some((key) => key.startsWith("exception."));

export interface CacheSpan {
  spanId: string,
  type: string,
  start: string,
  end: string,
  parent: string,
  name: string,
  status: string,
  attributes: Record<string, any>,
  input: any,
  output: any,
  requestModel: string,
  responseModel: string,
  inputCost: number,
  outputCost: number,
  totalCost: number,
  inputTokens: number,
  outputTokens: number,
  totalTokens: number,
  model: string,
  traceId: string,
  provider: string,
  path: string,
  events: SpanEvent[],
};

interface SpanStructure {
  id: number;
  start: string;
  end: string;
  parent: number;
  name: string;
  status: string;
};

const fetchFullTraceSpansToCache = async (input: z.infer<typeof GetTraceStructureSchema>): Promise<CacheSpan[]> => {
  const { projectId, traceId, startTime, endTime } = input;

  const spans = await executeQuery({
    projectId,
    query: `
      SELECT
        span_id,
        name,
        span_type,
        start_time,
        end_time,
        input_cost,
        output_cost,
        total_cost,
        model,
        trace_id,
        provider,
        input_tokens,
        output_tokens,
        total_tokens,
        path,
        input,
        output,
        status,
        attributes,
        request_model,
        response_model,
        parent_span_id
      FROM spans
      WHERE trace_id = {trace_id: UUID}
      AND start_time >= {start_time:DateTime(3)} - interval '1 second'
      AND start_time <= {end_time:DateTime(3)} + interval '1 second'
      ORDER BY start_time ASC
    `,
    parameters: {
      start_time: startTime.replace("Z", ""),
      end_time: endTime.replace("Z", ""),
      trace_id: traceId,
    },
  });

  const spanIdsMap = groupBy(spans, "span_id");

  const events = await executeQuery({
    projectId,
    query: `
      SELECT span_id, timestamp, name, attributes FROM events
      WHERE span_id IN {span_ids:Array(UUID)}
      AND timestamp >= {start_time:DateTime(3)} - interval '1 second'
      AND timestamp <= {end_time:DateTime(3)} + interval '1 second'
      ORDER BY timestamp ASC
    `,
    parameters: {
      span_ids: Object.keys(spanIdsMap),
      start_time: startTime.replace("Z", ""),
      end_time: endTime.replace("Z", ""),
    },
  });

  const eventsMap = groupBy(events, "span_id");

  const spansWithEvents = spans.map((span) => ({
    ...span,
    events: eventsMap[span.span_id as string] || [],
  }));

  const spansWithEventsParsed = ClickHouseToCacheSpanSchema.array().parse(spansWithEvents);

  const cacheKey = `${TRACE_CHATS_CACHE_KEY}:${projectId}:${traceId}`;

  await cache.set(cacheKey, spansWithEventsParsed, 'EX', 60 * 60 * 24);

  return spansWithEventsParsed as CacheSpan[];
};

export const getTraceStructureFromCache = async (input: z.infer<typeof GetTraceStructureSchema>): Promise<SpanStructure[]> => {
  const { projectId, traceId } = input;

  const key = `${TRACE_CHATS_CACHE_KEY}:${projectId}:${traceId}`;

  let allData = await cache.get<CacheSpan[]>(key);

  if (!allData) {
    allData = await fetchFullTraceSpansToCache(input);
  }

  const spanIdToId = allData.reduce((acc, span, index) => {
    acc[span.spanId] = index + 1;
    return acc;
  }, {} as Record<string, number>);

  return allData.map((span, index) => ({
    id: index + 1,
    start: span.start,
    end: span.end,
    parent: spanIdToId[span.parent],
    name: span.name,
    status: span.status,
  }));
};

interface SpanData {
  id: number;
  input: any;
  output: any;
  errorEvents: SpanEvent[];
}

export const getSpansDataFromCache = async (input: z.infer<typeof GetTraceStructureSchema>, ids: number[]): Promise<SpanData[]> => {
  const { projectId, traceId, startTime, endTime } = input;

  const key = `${TRACE_CHATS_CACHE_KEY}:${projectId}:${traceId}`;

  let allData = await cache.get<CacheSpan[]>(key);

  if (!allData) {
    allData = await fetchFullTraceSpansToCache({ projectId, traceId, startTime, endTime });
  }

  const processedData = replaceBase64ImagesInSpans(allData);

  return processedData.map((span, index) => ({
    name: span.name,
    id: index + 1,
    input: span.input,
    output: span.output,
    errorEvents: span.events.filter(isErrorEvent),
  })).filter((span) => ids.includes(span.id));
};

export const getFullTraceSpans = async (input: z.infer<typeof GetTraceStructureSchema>): Promise<CacheSpan[]> => {
  const { projectId, traceId, startTime, endTime } = input;

  const key = `${TRACE_CHATS_CACHE_KEY}:${projectId}:${traceId}`;

  let allData = await cache.get<CacheSpan[]>(key);

  if (!allData) {
    allData = await fetchFullTraceSpansToCache({ projectId, traceId, startTime, endTime });
  }

  return deduplicateSpanContent(allData);
};
