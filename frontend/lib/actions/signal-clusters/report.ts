import "server-only";
import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { AGENT_AVAILABLE, agentAppUrl, answerHeadlessTurn } from "@/lib/agent";
import { callAppServer } from "@/lib/api/backend";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { signalClusterArchives, signalClusterReports } from "@/lib/db/migrations/schema";

import { type ClusterScope, type ClusterScopeInput, resolveClusterScope } from "./scope";
import { type ClusterReport, REPORT_STALE_MINUTES } from "./types";

/** Every report written on the cluster, newest first. Retrying a failed run reuses its row. */
export async function getClusterReports(input: ClusterScopeInput): Promise<ClusterReport[]> {
  const { projectId, clusterId } = await resolveClusterScope(input);
  const rows = await db
    .select({
      id: signalClusterReports.id,
      status: signalClusterReports.status,
      content: signalClusterReports.content,
      error: signalClusterReports.error,
      createdAt: signalClusterReports.createdAt,
      updatedAt: signalClusterReports.updatedAt,
    })
    .from(signalClusterReports)
    .where(and(eq(signalClusterReports.projectId, projectId), eq(signalClusterReports.clusterId, clusterId)))
    .orderBy(desc(signalClusterReports.createdAt));
  return rows.map((row) => ({
    ...row,
    status: row.status as ClusterReport["status"],
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));
}

const reportPrompt = ({ projectId, signalId, clusterId, signal, clusterName }: ClusterScope) => {
  const signalName = signal.name;
  clusterName ||= "Unnamed cluster";
  const projectUrl = `${agentAppUrl()}/project/${projectId}`;
  return `Write a report on the cluster "${clusterName}" (cluster_id ${clusterId}) of the signal "${signalName}" (signal_id ${signalId}).

Investigate first:
- Read the cluster's events: \`signal_events\` rows where \`has(clusters, '${clusterId}')\` (their \`payload\`, \`timestamp\`, \`trace_id\`), and how many there are over time.
- Never read the traces themselves (no \`get_trace_context\`, no queries on \`spans\` or \`traces\`). The events' payloads are your only evidence.
- If you have \`open_sandbox\`, open it and find the code behind the problem, so the recommendation points at real files and functions. If you don't have it, or the project has no repositories, recommend from the events alone.

Then answer with ONLY the report, in Markdown, with exactly these four sections and nothing before or after:

## Overview
At most 4 sentences describing the problem. When the problem is a sequence of steps, write it as a numbered list instead, one step per item.
Leave out event counts and dates: the page already shows them, and they go stale as new events join the cluster.

## Consequences
At most 2 sentences on how it affects users and what it breaks downstream.

## Examples
A table with columns \`Trace | Date | What happened\`: 3 to 5 example events, each linked to its trace as [short label](${projectUrl}/traces/<trace_id>), its date as YYYY-MM-DD, and one sentence on what happened, taken from the event's payload.

## Recommendation
How to fix it, as bullet points: one short sentence of direction, then one bullet per change. Name the files and functions to change when you found them in the code.

Write for someone skimming:
- Short, plain sentences; no jargon or nested clauses.
- Bold only the few load-bearing terms, never whole sentences.
- Drop anything redundant or that the reader can infer.`;
};

/** Writes the run's outcome, unless a retry has since claimed the row for a run of its own. */
const settle = (clusterId: string, sessionId: string, values: Partial<typeof signalClusterReports.$inferInsert>) =>
  db
    .update(signalClusterReports)
    .set({ ...values, updatedAt: sql`now()` })
    .where(and(eq(signalClusterReports.clusterId, clusterId), eq(signalClusterReports.sessionId, sessionId)));

/** Which alert a run app-server started sends once it settles. */
export type ClusterNotice = "new" | "reopened";

const NOTIFY_RETRY_DELAYS_MS = [2_000, 10_000];

/**
 * Has app-server send the cluster's alert (new, or new events in a resolved one), with the report when there is one. Lost if this process
 * restarts mid-run or every attempt fails: an accepted gap, the cluster stays visible on the signal page. A retry
 * after a partial send can repeat an alert already pushed.
 */
async function sendClusterNotification(
  { projectId, signalId, clusterId }: ClusterScope,
  notify: ClusterNotice,
  report: string | null
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await callAppServer(`/projects/${projectId}/signals/${signalId}/clusters/${clusterId}/new-cluster-notification`, {
        method: "POST",
        body: { report, reopened: notify === "reopened" },
      });
      return;
    } catch (error) {
      const delay = NOTIFY_RETRY_DELAYS_MS[attempt];
      // A 4xx won't change on retry.
      if (error instanceof ApiError || delay === undefined) {
        console.error(`[cluster-report] ${clusterId} new-cluster notification failed:`, error);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function writeReport(scope: ClusterScope, sessionId: string, notify: ClusterNotice | undefined) {
  const report = await runReport(scope, sessionId);
  if (notify) await sendClusterNotification(scope, notify, report);
}

/** Runs the agent and settles the row; returns the report, or null when the run failed. */
async function runReport(scope: ClusterScope, sessionId: string): Promise<string | null> {
  const { projectId, clusterId } = scope;
  try {
    const { answer, error } = await answerHeadlessTurn({
      source: "report",
      projectId,
      userId: null,
      conversationId: sessionId,
      message: reportPrompt(scope),
      // Ends before the row counts as stale, so a retry never runs alongside a live run.
      timeoutMs: (REPORT_STALE_MINUTES - 5) * 60_000,
    });
    if (error || !answer.trim()) {
      await settle(clusterId, sessionId, { status: "failed", error: error ?? "The agent finished without a report" });
      return null;
    }
    await settle(clusterId, sessionId, { status: "done", content: answer, error: null });
    return answer;
  } catch (error) {
    console.error(`[cluster-report] ${clusterId} failed:`, error);
    await settle(clusterId, sessionId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    }).catch((settleError) => console.error(`[cluster-report] ${clusterId} settle failed:`, settleError));
    return null;
  }
}

/**
 * Starts the agent on an L1 cluster's report and returns without waiting (a run takes minutes). A no-op while one
 * is being written, when the signal has reports off, when the cluster is archived, or when it already has a report.
 * A failed or stale run is retried.
 *
 * `regenerate` starts a new report even when one is written, as when new events reopen a resolved cluster.
 * `notify`: app-server's request for a new or reopened cluster, whose alert waits for this run. When this returns
 * `started: false`, app-server sends the alert without a report.
 */
export async function startClusterReport(
  input: ClusterScopeInput,
  { regenerate = false, notify }: { regenerate?: boolean; notify?: ClusterNotice } = {}
): Promise<{ started: boolean }> {
  const scope = await resolveClusterScope(input);
  const { projectId, signalId, clusterId } = scope;
  // New clusters request reports unconditionally, so the signal's setting and archiving are enforced here.
  if (!AGENT_AVAILABLE || !scope.signal.settings.reportsEnabled) return { started: false };
  const [archive] = await db
    .select({ clusterId: signalClusterArchives.clusterId })
    .from(signalClusterArchives)
    .where(and(eq(signalClusterArchives.projectId, projectId), eq(signalClusterArchives.clusterId, clusterId)))
    .limit(1);
  if (archive) return { started: false };

  // Each run owns its row through its session id, so a stale run that finishes after a retry can't overwrite it.
  const sessionId = randomUUID();
  const claimed = await db.transaction(async (tx) => {
    // Serializes claims per cluster, so two requests can't both start a run.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${clusterId}))`);
    const [latest] = await tx
      .select({
        id: signalClusterReports.id,
        status: signalClusterReports.status,
        updatedAt: signalClusterReports.updatedAt,
      })
      .from(signalClusterReports)
      .where(and(eq(signalClusterReports.projectId, projectId), eq(signalClusterReports.clusterId, clusterId)))
      .orderBy(desc(signalClusterReports.createdAt))
      .limit(1);

    const stale = Date.now() - new Date(latest?.updatedAt ?? 0).getTime() > REPORT_STALE_MINUTES * 60_000;
    if (latest && (latest.status === "failed" || (latest.status === "pending" && stale))) {
      await tx
        .update(signalClusterReports)
        .set({ status: "pending", error: null, sessionId, updatedAt: sql`now()` })
        .where(eq(signalClusterReports.id, latest.id));
      return true;
    }
    if (latest && !(regenerate && latest.status === "done")) return false;
    await tx.insert(signalClusterReports).values({ clusterId, projectId, signalId, status: "pending", sessionId });
    return true;
  });
  if (!claimed) return { started: false };

  void writeReport(scope, sessionId, notify);
  return { started: true };
}
