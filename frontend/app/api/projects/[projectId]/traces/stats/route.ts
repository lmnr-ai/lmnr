import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { getTraceStats, GetTraceStatsSchema } from "@/lib/actions/traces/stats";
import { generateEmptyTimeBuckets } from "@/lib/actions/traces/utils.ts";
import { SafeParseTimeRangeSchema } from "@/lib/time";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetTraceStatsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    const timeRange = SafeParseTimeRangeSchema.parse({
      pastHours: req.nextUrl.searchParams.get("pastHours") ?? undefined,
      startDate: req.nextUrl.searchParams.get("startTime") ?? undefined,
      endDate: req.nextUrl.searchParams.get("endTime") ?? undefined,
    }) ?? {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date(),
    };
    const items = generateEmptyTimeBuckets(timeRange);
    return Response.json({ items });
  }

  try {
    const result = await getTraceStats({ ...parseResult.data, projectId });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch trace stats." },
      { status: 500 }
    );
  }
}
