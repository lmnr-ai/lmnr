import { and, eq, inArray } from "drizzle-orm";

import { Operator } from "@/lib/actions/common/operators";
import { getMainAgentIOBatch } from "@/lib/actions/sessions/trace-io";
import { getTraces } from "@/lib/actions/traces";
import { db } from "@/lib/db/drizzle";
import { debuggerSessions, sharedDebuggerSessions, sharedTraces } from "@/lib/db/migrations/schema";
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
 *
 * Backfills `shared_traces` for the returned runs: visibility is toggled once, but
 * the agent keeps appending runs to a live session afterwards. Those later runs
 * carry the session's metadata key (so they show up in this list) but were never
 * inserted into `shared_traces` at toggle time, so the per-trace shared routes
 * (spans/previews/panels) would 404 on them. Re-syncing here keeps every run the
 * list surfaces loadable through those routes.
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

  const traces = await getTraces({
    projectId: shared.projectId,
    pageNumber: 0,
    pageSize: MAX_RUNS,
    traceType: "DEFAULT",
    searchIn: [],
    sortDirection: "DESC",
    filter: [{ column: "metadata", operator: Operator.Eq, value: `rollout.session_id=${sessionId}` }],
  });

  const traceIds = traces.items.map((t) => t.id);
  if (traceIds.length > 0) {
    await db
      .insert(sharedTraces)
      .values(traceIds.map((id) => ({ id, projectId: shared.projectId })))
      .onConflictDoNothing();
  }

  return traces;
}

/**
 * Main-agent input/output previews for a shared session's traces. Guarded by the
 * session, then served scoped to its project. The requested trace ids are
 * intersected with `shared_traces` first so a public session id can't be used to
 * read previews for arbitrary (non-shared) traces in the same project.
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

  if (traceIds.length === 0) {
    return {};
  }

  const sharedRows = await db.query.sharedTraces.findMany({
    columns: { id: true },
    where: and(eq(sharedTraces.projectId, shared.projectId), inArray(sharedTraces.id, traceIds)),
  });
  const allowedTraceIds = sharedRows.map((r) => r.id);

  if (allowedTraceIds.length === 0) {
    return {};
  }

  return getMainAgentIOBatch({ traceIds: allowedTraceIds, projectId: shared.projectId });
}
