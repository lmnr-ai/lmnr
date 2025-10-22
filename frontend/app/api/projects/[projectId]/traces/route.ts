import { chunk, random, sample, sampleSize, times } from "lodash";
import { NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { deleteTraces, DeleteTracesSchema, getTraces, GetTracesSchema } from "@/lib/actions/traces";
import { SpanType, TraceRow } from "@/lib/traces/types";

// Mock mode - set to true to use mock data
const MOCK_MODE = true;

// Generate mock traces data
const generateMockTraces = (): TraceRow[] => {
  const spanTypes = Object.values(SpanType);
  const statuses = ["ok", "error"];
  const analysisStatuses = ["info", "warning", "error"];
  const topSpanNames = [
    "Chat Completion",
    "Generate Summary",
    "Process Document",
    "Analyze Sentiment",
    "Extract Entities",
    "Translate Text",
    "Answer Question",
    "Search Database",
    "API Call",
    "Data Processing",
  ];
  const tags = ["production", "staging", "test", "v1", "v2", "important", "reviewed"];
  const userIds = times(10, (i) => `user-${i + 1}`);
  const sessionIds = times(20, (i) => `session-${i + 1}`);

  return times(150, (i) => {
    const startTime = new Date(Date.now() - random(1000, 100000) * 1000);
    const duration = random(100, 10000);
    const endTime = new Date(startTime.getTime() + duration);
    const inputTokens = random(10, 5000);
    const outputTokens = random(10, 3000);
    const inputCost = inputTokens * 0.000001 * random(1, 5);
    const outputCost = outputTokens * 0.000002 * random(1, 5);

    return {
      id: `trace-${String(i + 1).padStart(3, "0")}`,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      topSpanName: sample(topSpanNames),
      topSpanId: `span-${String(i + 1).padStart(3, "0")}`,
      topSpanType: sample(spanTypes),
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      traceType: "DEFAULT" as const,
      sessionId: sample(sessionIds),
      metadata: {
        environment: sample(["production", "staging", "development"])!,
        version: sample(["1.0.0", "1.1.0", "2.0.0"])!,
      },
      userId: sample(userIds),
      status: sample(statuses)!,
      tags: sampleSize(tags, random(0, 3)),
      analysis_status: sample(analysisStatuses),
    };
  });
};

// Keep traces in generated order (trace-001 to trace-150)
const MOCK_TRACES = generateMockTraces();

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetTracesSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  // Mock mode
  if (MOCK_MODE) {
    const pageNumber = parseResult.data.pageNumber ?? 0;
    const pageSize = parseResult.data.pageSize ?? 50;

    // Paginate the mock data
    const paginatedTraces = chunk(MOCK_TRACES, pageSize)[pageNumber] ?? [];

    return Response.json({
      items: paginatedTraces,
      count: MOCK_TRACES.length,
    });
  }

  // Real implementation
  try {
    const result = await getTraces({ ...parseResult.data, projectId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch traces." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceIds = req.nextUrl.searchParams.getAll("traceId");

  const parseResult = DeleteTracesSchema.safeParse({ projectId, traceIds });

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    await deleteTraces(parseResult.data);
    return new Response("Traces deleted successfully.", { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return new Response(error instanceof Error ? error.message : "Error deleting traces.", { status: 500 });
  }
}
