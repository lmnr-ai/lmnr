import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { getTraceSummary,GetTraceSummarySchema } from "@/lib/actions/traces/summary";
import { authOptions } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;

  const searchParams = parseUrlParams(req.nextUrl.searchParams, GetTraceSummarySchema.omit({ projectId: true, traceId: true, apiKey: true }));

  if (!searchParams.success) {
    return NextResponse.json({ error: searchParams.error }, { status: 400 });
  }
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user;
  const data = searchParams.data;

  const summary = await getTraceSummary({ ...data, projectId: params.projectId, traceId: params.traceId, apiKey: user.apiKey });
  return NextResponse.json({ summary });
}
