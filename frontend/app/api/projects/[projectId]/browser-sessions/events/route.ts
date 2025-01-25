import { clickhouseClient } from "@/lib/clickhouse/client";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const { projectId } = params;

  const traceId = request.nextUrl.searchParams.get('traceId');
  console.log('traceId', traceId, 'projectId', projectId);
  const res = await clickhouseClient.query({
    query: 'SELECT * FROM browser_session_events WHERE trace_id = {id: UUID} AND project_id = {projectId: UUID} ORDER BY timestamp ASC',
    format: 'JSONEachRow',
    query_params: {
      id: traceId,
      projectId: projectId
    }
  });
  const events = await res.json();
  return NextResponse.json(events);
}