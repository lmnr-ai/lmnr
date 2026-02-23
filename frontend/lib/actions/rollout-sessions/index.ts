import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import { buildSelectQuery } from "@/lib/actions/common/query-builder";
import { PaginationSchema } from "@/lib/actions/common/types";
import { tryParseJson } from "@/lib/actions/common/utils";
import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { rolloutSessions, sharedTraces } from "@/lib/db/migrations/schema";
import { fetcherJSON } from "@/lib/utils";

export type RolloutSessionStatus = "PENDING" | "RUNNING" | "FINISHED" | "STOPPED";

export type RolloutSession = {
  id: string;
  createdAt: string;
  name: string | null;
  projectId: string;
  params: Record<string, any>;
  status: RolloutSessionStatus;
};

const GetRolloutSessionSchema = z.object({
  projectId: z.string(),
  id: z.string(),
});

export const GetRolloutSessionsSchema = PaginationSchema.extend({
  projectId: z.string(),
});

export const getRolloutSessions = async (input: z.infer<typeof GetRolloutSessionsSchema>) => {
  const { projectId, pageNumber, pageSize } = input;

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const result = await db
    .select()
    .from(rolloutSessions)
    .where(eq(rolloutSessions.projectId, projectId))
    .orderBy(desc(rolloutSessions.createdAt))
    .limit(limit)
    .offset(offset);

  return { items: result };
};

export async function getRolloutSession(input: z.infer<typeof GetRolloutSessionSchema>) {
  const { projectId, id } = GetRolloutSessionSchema.parse(input);

  const result = await db.query.rolloutSessions.findFirst({
    where: and(eq(rolloutSessions.id, id), eq(rolloutSessions.projectId, projectId)),
  });

  return result;
}

const GetLatestTraceBySessionIdSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
});

export async function getLatestTraceBySessionId(
  input: z.infer<typeof GetLatestTraceBySessionIdSchema>
): Promise<TraceViewTrace | undefined> {
  const { projectId, sessionId } = GetLatestTraceBySessionIdSchema.parse(input);

  const [trace] = await executeQuery<Omit<TraceViewTrace, "visibility">>({
    query: `
      SELECT
        id,
        formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime,
        formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime,
        input_tokens as inputTokens,
        output_tokens as outputTokens,
        total_tokens as totalTokens,
        input_cost as inputCost,
        output_cost as outputCost,
        total_cost as totalCost,
        metadata,
        status,
        trace_type as traceType,
        has_browser_session as hasBrowserSession
      FROM traces
      WHERE simpleJSONExtractString(metadata, 'rollout.session_id') = {sessionId: String}
      ORDER BY start_time DESC
      LIMIT 1
    `,
    projectId,
    parameters: {
      sessionId,
    },
  });

  if (!trace) {
    return undefined;
  }

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: and(eq(sharedTraces.projectId, projectId), eq(sharedTraces.id, trace.id)),
  });

  return {
    ...trace,
    visibility: sharedTrace ? "public" : "private",
  };
}

const RunRolloutSessionSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  trace_id: z.string().optional(),
  path_to_count: z.record(z.string(), z.number()).optional(),
  args: z.union([z.record(z.string(), z.any()), z.array(z.any())]).optional(),
  overrides: z.record(z.string(), z.any()).optional(),
});

const UpdateRolloutSessionStatusSchema = z.object({
  projectId: z.string(),
  sessionId: z.string(),
  status: z.enum(["PENDING", "RUNNING", "FINISHED", "STOPPED"]),
});

const LinkTraceToPendingSessionSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export async function linkTraceToPendingSession(input: z.infer<typeof LinkTraceToPendingSessionSchema>) {
  const { projectId, traceId, startDate, endDate } = LinkTraceToPendingSessionSchema.parse(input);

  const latestPendingSession = await db.query.rolloutSessions.findFirst({
    where: and(eq(rolloutSessions.projectId, projectId), eq(rolloutSessions.status, "PENDING")),
    orderBy: [desc(rolloutSessions.createdAt)],
  });

  if (!latestPendingSession) {
    throw new Error("No pending rollout session found.");
  }

  const traceQueryConditions: Array<{ condition: string; params: Record<string, string> }> = [
    {
      condition: "id = {traceId: UUID}",
      params: { traceId },
    },
  ];

  if (startDate) {
    traceQueryConditions.push({
      condition: "start_time >= {startDate: String}",
      params: { startDate: startDate.replace("Z", "") },
    });
  }

  if (endDate) {
    traceQueryConditions.push({
      condition: "end_time <= {endDate: String}",
      params: { endDate: endDate.replace("Z", "") },
    });
  }

  const { query: traceQuery, parameters: traceParameters } = buildSelectQuery({
    select: {
      columns: ["metadata"],
      table: "traces",
    },
    customConditions: traceQueryConditions,
    pagination: { limit: 1, offset: 0 },
  });

  const [trace] = await executeQuery<{ metadata: string }>({
    query: traceQuery,
    projectId,
    parameters: traceParameters,
  });

  if (!trace) {
    throw new Error("Trace not found.");
  }

  const parsedMetadata = tryParseJson(trace.metadata ?? "{}");
  const metadata =
    parsedMetadata && typeof parsedMetadata === "object" && !Array.isArray(parsedMetadata)
      ? { ...(parsedMetadata as Record<string, unknown>) }
      : {};

  metadata["rollout.session_id"] = latestPendingSession.id;

  await clickhouseClient.command({
    query: `
      ALTER TABLE traces_replacing
      UPDATE metadata = {metadata: String}
      WHERE project_id = {projectId: UUID} AND id = {traceId: UUID}
    `,
    query_params: {
      projectId,
      traceId,
      metadata: JSON.stringify(metadata),
    },
  });

  return {
    sessionId: latestPendingSession.id,
  };
}

export async function runRolloutSession(input: z.infer<typeof RunRolloutSessionSchema>) {
  const { projectId, sessionId, trace_id, path_to_count, args, overrides } = RunRolloutSessionSchema.parse(input);

  const result = await fetcherJSON(`/projects/${projectId}/rollouts/${sessionId}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      trace_id,
      path_to_count,
      args: args || {},
      overrides: overrides || {},
    }),
  });

  return result;
}

export async function updateRolloutSessionStatus(input: z.infer<typeof UpdateRolloutSessionStatusSchema>) {
  const { projectId, sessionId, status } = UpdateRolloutSessionStatusSchema.parse(input);

  const res = await fetch(`${process.env.BACKEND_URL}/api/v1/projects/${projectId}/rollouts/${sessionId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to update status");
  }

  // Handle empty response body from backend
  const text = await res.text();
  const result = text ? JSON.parse(text) : { success: true };

  return result;
}
