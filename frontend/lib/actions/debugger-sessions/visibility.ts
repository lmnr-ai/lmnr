import { and, eq, inArray } from "drizzle-orm";

import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { debuggerSessions, sharedDebuggerSessions, sharedTraces } from "@/lib/db/migrations/schema";

export async function updateDebuggerSessionVisibility({
  sessionId,
  projectId,
  visibility,
}: {
  sessionId: string;
  projectId: string;
  visibility: "public" | "private";
}) {
  // Verify the session exists and belongs to this project
  const session = await db.query.debuggerSessions.findFirst({
    where: and(eq(debuggerSessions.id, sessionId), eq(debuggerSessions.projectId, projectId)),
  });

  if (!session) {
    throw new Error("Session not found");
  }

  // All traces grouped to this session live in ClickHouse, keyed by the
  // `rollout.session_id` trace-metadata key (same key the session view groups on).
  const rows = await executeQuery<{ traceId: string }>({
    query: `
      SELECT DISTINCT id AS traceId
      FROM traces
      WHERE simpleJSONExtractString(metadata, 'rollout.session_id') = {sessionId: String}
    `,
    projectId,
    parameters: { sessionId },
  });
  const traceIds = rows.map((r) => r.traceId);

  if (visibility === "public") {
    await db.transaction(async (tx) => {
      await tx.insert(sharedDebuggerSessions).values({ id: sessionId, projectId }).onConflictDoNothing();

      if (traceIds.length > 0) {
        await tx
          .insert(sharedTraces)
          .values(traceIds.map((id) => ({ id, projectId })))
          .onConflictDoNothing();
      }
    });
  } else {
    await db.transaction(async (tx) => {
      await tx.delete(sharedDebuggerSessions).where(eq(sharedDebuggerSessions.id, sessionId));
      if (traceIds.length > 0) {
        await tx.delete(sharedTraces).where(inArray(sharedTraces.id, traceIds));
      }
    });
  }
}

export async function isDebuggerSessionPublic(sessionId: string): Promise<boolean> {
  const row = await db.query.sharedDebuggerSessions.findFirst({
    where: eq(sharedDebuggerSessions.id, sessionId),
  });

  return !!row;
}
