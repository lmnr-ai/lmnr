import { and, eq } from "drizzle-orm";

import { Operator } from "@/lib/actions/common/operators";
import { getMainAgentIOBatch } from "@/lib/actions/sessions/trace-io";
import { getTraces } from "@/lib/actions/traces";
import { db } from "@/lib/db/drizzle";
import { debuggerSessions, sharedDebuggerSessions } from "@/lib/db/migrations/schema";
import { type TraceRow } from "@/lib/traces/types";

// Mirrors the authed store's MAX_RUNS cap (createDebuggerSessionViewStore).
const MAX_RUNS = 200;

/**
 * Resolve a publicly-shared debugger session. Guard mirrors `getSharedEvaluation`:
 * presence in `shared_debugger_sessions` is the only thing that makes a session
 * public, so we look it up there first and load the session row scoped to the
 * owning project. Returns undefined when the session isn't shared.
 */
export async function getSharedDebuggerSession({ sessionId }: { sessionId: string }) {
  const publicSession = await db.query.sharedDebuggerSessions.findFirst({
    where: eq(sharedDebuggerSessions.id, sessionId),
  });

  if (!publicSession) {
    return undefined;
  }

  const session = await db.query.debuggerSessions.findFirst({
    where: and(eq(debuggerSessions.id, sessionId), eq(debuggerSessions.projectId, publicSession.projectId)),
  });

  if (!session) {
    return undefined;
  }

  return { session, projectId: publicSession.projectId };
}

/**
 * Traces grouped to a shared session, by the `rollout.session_id` trace-metadata
 * key (same grouping the authed view uses). Guarded — a private session yields
 * undefined, never the underlying traces.
 */
export async function getSharedDebuggerSessionTraces({
  sessionId,
}: {
  sessionId: string;
}): Promise<{ items: TraceRow[] } | undefined> {
  const shared = await getSharedDebuggerSession({ sessionId });
  if (!shared) {
    return undefined;
  }

  return getTraces({
    projectId: shared.projectId,
    pageNumber: 0,
    pageSize: MAX_RUNS,
    traceType: "DEFAULT",
    searchIn: [],
    sortDirection: "DESC",
    filter: [{ column: "metadata", operator: Operator.Eq, value: `rollout.session_id=${sessionId}` }],
  });
}

/**
 * Main-agent input/output previews for a shared session's traces. Guarded by the
 * session, then served scoped to its project — every trace in a public session
 * is itself public (the visibility action inserts them all into `shared_traces`).
 */
export async function getSharedDebuggerSessionTraceIO({
  sessionId,
  traceIds,
}: {
  sessionId: string;
  traceIds: string[];
}) {
  const shared = await getSharedDebuggerSession({ sessionId });
  if (!shared) {
    return undefined;
  }

  return getMainAgentIOBatch({ traceIds, projectId: shared.projectId });
}
