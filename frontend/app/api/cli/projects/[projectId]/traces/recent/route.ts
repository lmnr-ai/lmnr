import { type NextRequest } from "next/server";

import { isUserMemberOfProject } from "@/lib/authorization";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { resolveCaller } from "@/lib/oauth/resolve-caller";

const MAX_SECONDS = 24 * 60 * 60;
const DEFAULT_SECONDS = 60;

function parseDurationSeconds(raw: string | null): number {
  if (!raw) return DEFAULT_SECONDS;
  const trimmed = raw.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)\s*(s|m|h)?$/);
  if (!match) return DEFAULT_SECONDS;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SECONDS;
  const unit = match[2] ?? "s";
  let seconds = n;
  if (unit === "m") seconds = n * 60;
  if (unit === "h") seconds = n * 3600;
  return Math.min(seconds, MAX_SECONDS);
}

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const caller = await resolveCaller(req);
  if (!caller) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { projectId } = await props.params;
  if (!/^[0-9a-fA-F-]{36}$/.test(projectId)) {
    return Response.json({ error: "invalid_project_id" }, { status: 400 });
  }

  const member = await isUserMemberOfProject(projectId, caller.userId);
  if (!member) {
    return Response.json({ error: "project_forbidden" }, { status: 403 });
  }

  const sinceSeconds = parseDurationSeconds(req.nextUrl.searchParams.get("since"));

  try {
    // Spans (not traces) are the leading indicator — the traces table is
    // upserted async, but spans land synchronously. For agent verification
    // any span in-window means "tracing works".
    const result = await clickhouseClient.query({
      query: `SELECT count() AS count FROM spans WHERE project_id = {projectId:UUID} AND start_time > now() - INTERVAL {seconds:Int32} SECOND`,
      format: "JSONEachRow",
      query_params: { projectId, seconds: sinceSeconds },
    });
    const rows = await result.json<{ count: string | number }>();
    const count = rows.length > 0 ? Number(rows[0].count) : 0;
    return Response.json({ count, projectId, sinceSeconds });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
