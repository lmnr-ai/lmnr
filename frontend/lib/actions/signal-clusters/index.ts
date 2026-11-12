import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { ApiError, AuthorizationError } from "@/lib/api/errors";
import { getServerSession } from "@/lib/auth-session";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import {
  agentVersions,
  signalClusterArchives,
  signalClusterResolutions,
  signalClusterViews,
  users,
} from "@/lib/db/migrations/schema";

const resolver = alias(users, "resolver");
const reopener = alias(users, "reopener");
const archiver = alias(users, "archiver");

import { ClusterScopeSchema, resolveClusterScope, SignalScopeSchema } from "./scope";
import {
  type ClusterResolution,
  type ClusterDaily,
  CLUSTER_WINDOW_DAYS,
  type ClusterVersionMarker,
  type SignalCluster,
  type SignalClustersResponse,
} from "./types";

const SAMPLE_TRACES = 3;

async function requireUserId(): Promise<string> {
  const session = await getServerSession();
  if (!session) throw new AuthorizationError("Unauthorized", 401);
  return session.user.id;
}

// ClickHouse DateTime64 strings come back as "YYYY-MM-DD HH:MM:SS.fff" in UTC with no offset.
const chToIso = (value: string) => new Date(`${value.replace(" ", "T")}Z`).toISOString();

function windowDays(now = new Date()): string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: CLUSTER_WINDOW_DAYS }, (_, i) =>
    new Date(today - (CLUSTER_WINDOW_DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10)
  );
}

/** Unread when the cluster has an event newer than the user's last view, or no view at all. */
const isUnread = (lastSeen: string, lastViewedAt: string | undefined) =>
  !lastViewedAt || new Date(lastSeen) > new Date(lastViewedAt);

/**
 * When each L1 cluster last got an event, by ingest time rather than trace time, so late or backfilled events still
 * count as new. Only the last `CLUSTER_WINDOW_DAYS` of ingest are read: a cluster quiet for longer has nothing unread.
 * Reads memberships straight from `signal_event_summaries` (an L0 member counts toward its L1 parent) instead of
 * `signal_events_v0`, which would `FINAL` the whole project. `is_deleted = 0` without `FINAL` is enough for a max.
 * Raw ClickHouse: the SQL engine doesn't expose `signal_events.created_at`.
 */
async function lastIngestedByCluster(projectId: string, signalIds: string[] = []) {
  const result = await clickhouseClient.query({
    query: `
      SELECT s.signal_id AS signalId, toString(c) AS clusterId,
        formatDateTime(max(e.ingested_at), '%Y-%m-%d %H:%i:%S.%f') AS lastIngested
      FROM signal_event_summaries AS s
      ARRAY JOIN arrayFilter(
        x -> dictGetOrDefault('clusters_dict', 'level', (s.project_id, x), toUInt8(0)) = 1,
        arrayPushFront(dictGetOrDefault('clusters_dict', 'path', (s.project_id, s.cluster_id), []), s.cluster_id)
      ) AS c
      INNER JOIN (
        SELECT id, max(created_at) AS ingested_at FROM signal_events
        PREWHERE project_id = {projectId: UUID}
          AND (empty({signalIds: Array(UUID)}) OR signal_id IN {signalIds: Array(UUID)})
        WHERE is_deleted = 0 AND created_at >= now() - INTERVAL {days: UInt32} DAY
        GROUP BY id
      ) AS e ON e.id = s.event_id
      PREWHERE s.project_id = {projectId: UUID}
        AND (empty({signalIds: Array(UUID)}) OR s.signal_id IN {signalIds: Array(UUID)})
      GROUP BY signalId, clusterId
    `,
    format: "JSONEachRow",
    query_params: { projectId, signalIds, days: CLUSTER_WINDOW_DAYS },
  });
  const rows = await result.json<{ signalId: string; clusterId: string; lastIngested: string }>();
  return rows.map((r) => ({ ...r, lastIngested: chToIso(r.lastIngested) }));
}

/** A signal's L1 clusters (the finest named level), with resolution and read state. */
export async function getSignalClusters(input: z.infer<typeof SignalScopeSchema>): Promise<SignalClustersResponse> {
  const { projectId, signalId } = SignalScopeSchema.parse(input);
  const userId = await requireUserId();
  const days = windowDays();

  const [clusters, stats, daily, resolutions, views, unclustered, unclusteredDaily, archives, ingested] =
    await Promise.all([
      executeQuery<{ id: string; name: string; createdAt: string }>({
        query: `SELECT id, name, formatDateTime(created_at, '%Y-%m-%d %H:%i:%S.%f') AS createdAt FROM clusters WHERE signal_id = {signalId: UUID} AND level = 1`,
        parameters: { signalId },
        projectId,
      }),
      executeQuery<{
        clusterId: string;
        total: number;
        traces: number;
        severity: number;
        firstSeen: string;
        lastSeen: string;
        traceIds: string[];
      }>({
        query: `
        SELECT
          cluster_id AS clusterId,
          count() AS total,
          uniqExact(trace_id) AS traces,
          avg(severity) AS severity,
          formatDateTime(min(timestamp), '%Y-%m-%d %H:%i:%S.%f') AS firstSeen,
          formatDateTime(max(timestamp), '%Y-%m-%d %H:%i:%S.%f') AS lastSeen,
          arraySlice(arrayMap(x -> tupleElement(x, 2), arrayReverseSort(groupArray((timestamp, trace_id)))), 1, ${SAMPLE_TRACES}) AS traceIds
        FROM signal_events
        ARRAY JOIN leaf_clusters AS cluster_id
        WHERE signal_id = {signalId: UUID}
        GROUP BY cluster_id
      `,
        parameters: { signalId },
        projectId,
      }),
      executeQuery<{ clusterId: string; day: string; count: number }>({
        query: `
        SELECT cluster_id AS clusterId, toString(toDate(timestamp)) AS day, count() AS count
        FROM signal_events
        ARRAY JOIN leaf_clusters AS cluster_id
        WHERE signal_id = {signalId: UUID} AND timestamp >= toDateTime64({from: String}, 9, 'UTC')
        GROUP BY clusterId, day
      `,
        parameters: { signalId, from: `${days[0]} 00:00:00` },
        projectId,
      }),
      db
        .select({
          clusterId: signalClusterResolutions.clusterId,
          resolvedAt: signalClusterResolutions.resolvedAt,
          resolvedBy: resolver.name,
          reopenedAt: signalClusterResolutions.reopenedAt,
          reopenedBy: reopener.name,
          automatic: signalClusterResolutions.automatic,
        })
        .from(signalClusterResolutions)
        .leftJoin(resolver, eq(resolver.id, signalClusterResolutions.resolvedBy))
        .leftJoin(reopener, eq(reopener.id, signalClusterResolutions.reopenedBy))
        .where(and(eq(signalClusterResolutions.projectId, projectId), eq(signalClusterResolutions.signalId, signalId)))
        .orderBy(signalClusterResolutions.resolvedAt),
      db
        .select({ clusterId: signalClusterViews.clusterId, lastViewedAt: signalClusterViews.lastViewedAt })
        .from(signalClusterViews)
        .where(and(eq(signalClusterViews.userId, userId), eq(signalClusterViews.signalId, signalId))),
      executeQuery<{ total: number; lastSeen: string }>({
        query: `
        SELECT count() AS total, formatDateTime(max(timestamp), '%Y-%m-%d %H:%i:%S.%f') AS lastSeen
        FROM signal_events
        WHERE signal_id = {signalId: UUID} AND empty(clusters)
      `,
        parameters: { signalId },
        projectId,
      }),
      executeQuery<{ day: string; count: number }>({
        query: `
        SELECT toString(toDate(timestamp)) AS day, count() AS count
        FROM signal_events
        WHERE signal_id = {signalId: UUID} AND empty(clusters) AND timestamp >= toDateTime64({from: String}, 9, 'UTC')
        GROUP BY day
      `,
        parameters: { signalId, from: `${days[0]} 00:00:00` },
        projectId,
      }),
      db
        .select({
          clusterId: signalClusterArchives.clusterId,
          archivedAt: signalClusterArchives.archivedAt,
          archivedBy: archiver.name,
        })
        .from(signalClusterArchives)
        .leftJoin(archiver, eq(archiver.id, signalClusterArchives.archivedBy))
        .where(and(eq(signalClusterArchives.projectId, projectId), eq(signalClusterArchives.signalId, signalId))),
      lastIngestedByCluster(projectId, [signalId]),
    ]);

  const statsById = new Map(stats.map((s) => [s.clusterId, s]));
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const dailyById = new Map<string, number[]>();
  for (const row of daily) {
    const i = dayIndex.get(row.day);
    if (i === undefined) continue;
    const series = dailyById.get(row.clusterId) ?? Array.from({ length: days.length }, () => 0);
    series[i] = Number(row.count);
    dailyById.set(row.clusterId, series);
  }
  const resolutionsById = Map.groupBy(resolutions, (r) => r.clusterId);
  const viewedAt = new Map(views.map((v) => [v.clusterId, v.lastViewedAt]));
  const archiveById = new Map(archives.map((a) => [a.clusterId, a]));
  const ingestedById = new Map(ingested.map((r) => [r.clusterId, r.lastIngested]));

  const items = clusters.flatMap((cluster): SignalCluster[] => {
    const s = statsById.get(cluster.id);
    if (!s) return [];
    const lastSeen = chToIso(s.lastSeen);
    const ingested = ingestedById.get(cluster.id);
    const history: ClusterResolution[] = (resolutionsById.get(cluster.id) ?? []).map((r) => ({
      resolvedAt: new Date(r.resolvedAt).toISOString(),
      resolvedBy: r.resolvedBy,
      reopenedAt: r.reopenedAt ? new Date(r.reopenedAt).toISOString() : null,
      reopenedBy: r.reopenedBy,
      automatic: r.automatic,
    }));
    return [
      {
        id: cluster.id,
        name: cluster.name || "Unnamed cluster",
        daily: dailyById.get(cluster.id) ?? Array.from({ length: days.length }, () => 0),
        total: Number(s.total),
        traces: Number(s.traces),
        severity: Math.round(Number(s.severity)),
        firstSeen: chToIso(s.firstSeen),
        lastSeen,
        createdAt: chToIso(cluster.createdAt),
        sampleTraceIds: s.traceIds,
        status: history.some((r) => r.reopenedAt === null) ? "resolved" : "open",
        resolutions: history,
        archived: archiveOf(archiveById.get(cluster.id)),
        // Same rule as the sidebar badge: only events ingested within the window can be unread.
        unread: ingested !== undefined && isUnread(ingested, viewedAt.get(cluster.id)),
      },
    ];
  });

  const unclusteredTotal = Number(unclustered[0]?.total ?? 0);
  const unclusteredSeries = Array.from({ length: days.length }, () => 0);
  for (const row of unclusteredDaily) {
    const i = dayIndex.get(row.day);
    if (i !== undefined) unclusteredSeries[i] = Number(row.count);
  }
  return {
    days,
    items,
    unclustered:
      unclusteredTotal > 0
        ? { daily: unclusteredSeries, total: unclusteredTotal, lastSeen: chToIso(unclustered[0].lastSeen) }
        : null,
  };
}

/** Unread L1 clusters per signal in the project, for the sidebar badges. */
export async function getUnreadClusterCounts(input: { projectId: string }): Promise<Record<string, number>> {
  const { projectId } = z.object({ projectId: z.guid() }).parse(input);
  const userId = await requireUserId();

  const [ingested, views, archives] = await Promise.all([
    lastIngestedByCluster(projectId),
    db
      .select({ clusterId: signalClusterViews.clusterId, lastViewedAt: signalClusterViews.lastViewedAt })
      .from(signalClusterViews)
      .where(and(eq(signalClusterViews.userId, userId), eq(signalClusterViews.projectId, projectId))),
    // Archiving silences a cluster, so its new events don't count.
    db
      .select({ clusterId: signalClusterArchives.clusterId })
      .from(signalClusterArchives)
      .where(eq(signalClusterArchives.projectId, projectId)),
  ]);

  const viewedAt = new Map(views.map((v) => [v.clusterId, v.lastViewedAt]));
  const archived = new Set(archives.map((a) => a.clusterId));
  const counts: Record<string, number> = {};
  for (const row of ingested) {
    if (!archived.has(row.clusterId) && isUnread(row.lastIngested, viewedAt.get(row.clusterId))) {
      counts[row.signalId] = (counts[row.signalId] ?? 0) + 1;
    }
  }
  return counts;
}

export async function markClusterViewed(input: z.infer<typeof ClusterScopeSchema>): Promise<void> {
  const userId = await requireUserId();
  const { projectId, signalId, clusterId } = await resolveClusterScope(input);
  const now = new Date().toISOString();
  await db
    .insert(signalClusterViews)
    .values({ userId, clusterId, projectId, signalId, lastViewedAt: now })
    .onConflictDoUpdate({
      target: [signalClusterViews.userId, signalClusterViews.clusterId],
      set: { lastViewedAt: now },
    });
}

const archiveOf = (row: { archivedAt: string; archivedBy: string | null } | undefined) =>
  row ? { archivedAt: new Date(row.archivedAt).toISOString(), archivedBy: row.archivedBy } : null;

const SetArchivedSchema = ClusterScopeSchema.extend({ archived: z.boolean() });

/** Archiving is independent of resolving; unarchiving drops the row. Both are no-ops if already in that state. */
export async function setClusterArchived(input: z.infer<typeof SetArchivedSchema>): Promise<void> {
  const { archived } = SetArchivedSchema.parse(input);
  const userId = await requireUserId();
  const { projectId, signalId, clusterId } = await resolveClusterScope(input);
  if (archived) {
    await db
      .insert(signalClusterArchives)
      .values({ projectId, signalId, clusterId, archivedBy: userId })
      .onConflictDoNothing();
    return;
  }
  await db
    .delete(signalClusterArchives)
    .where(and(eq(signalClusterArchives.projectId, projectId), eq(signalClusterArchives.clusterId, clusterId)));
}

const SetResolvedSchema = ClusterScopeSchema.extend({ resolved: z.boolean() });

/** Resolving opens a new resolution row; reopening closes the open one. Both are no-ops if already in that state. */
export async function setClusterResolved(input: z.infer<typeof SetResolvedSchema>): Promise<void> {
  const { resolved } = SetResolvedSchema.parse(input);
  const userId = await requireUserId();
  const { projectId, signalId, clusterId } = await resolveClusterScope(input);

  if (resolved) {
    // The partial unique index allows one open resolution per cluster.
    await db
      .insert(signalClusterResolutions)
      .values({ projectId, signalId, clusterId, resolvedBy: userId })
      .onConflictDoNothing();
    return;
  }
  await db
    .update(signalClusterResolutions)
    .set({ reopenedAt: new Date().toISOString(), reopenedBy: userId })
    .where(
      and(
        eq(signalClusterResolutions.projectId, projectId),
        eq(signalClusterResolutions.clusterId, clusterId),
        isNull(signalClusterResolutions.reopenedAt)
      )
    );
}

/**
 * Rollout dates of the agent versions behind a cluster: every version of each agent whose traces the
 * cluster contains, at its first trace anywhere in the project. Empty without agent versioning.
 */
export async function getClusterVersionMarkers(
  input: z.infer<typeof ClusterScopeSchema>
): Promise<ClusterVersionMarker[]> {
  const { projectId, signalId, clusterId } = await resolveClusterScope(input);

  const rows = await executeQuery<{ versionHash: string; firstSeen: string }>({
    query: `
      SELECT tupleElement(v, 'version_hash') AS versionHash,
        formatDateTime(min(start_time), '%Y-%m-%d %H:%i:%S.%f') AS firstSeen
      FROM traces
      ARRAY JOIN agent_versions AS v
      WHERE tupleElement(v, 'agent_hash') IN (
        SELECT DISTINCT tupleElement(cv, 'agent_hash')
        FROM traces
        ARRAY JOIN agent_versions AS cv
        WHERE id IN (
          SELECT trace_id FROM signal_events
          WHERE signal_id = {signalId: UUID} AND has(leaf_clusters, {clusterId: UUID})
        )
      )
      GROUP BY versionHash
      ORDER BY firstSeen
    `,
    parameters: { signalId, clusterId },
    projectId,
  });
  if (rows.length === 0) return [];

  const versions = await db
    .select({ versionHash: agentVersions.versionHash, versionNumber: agentVersions.versionNumber })
    .from(agentVersions)
    .where(
      and(
        eq(agentVersions.projectId, projectId),
        inArray(
          agentVersions.versionHash,
          rows.map((r) => r.versionHash)
        )
      )
    );
  const numberByHash = new Map(versions.map((v) => [v.versionHash, v.versionNumber]));

  return rows.flatMap((r) => {
    const n = numberByHash.get(r.versionHash);
    return n === undefined ? [] : [{ label: `v${n}`, firstSeen: chToIso(r.firstSeen) }];
  });
}

const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

export const ClusterDailySchema = ClusterScopeSchema.extend({
  pastHours: z.coerce.number().positive().optional(),
  startDate: z.iso.datetime().optional(),
  endDate: z.iso.datetime().optional(),
  /** The viewer's IANA timezone, for the bars' date labels. */
  tz: z.string().max(64).optional(),
});

/** `YYYY-MM-DD` in the viewer's timezone; an unknown zone falls back to UTC. */
const dateIn = (tz: string | undefined) => {
  const options = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: tz ?? "UTC" });
  } catch {
    format = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "UTC" });
  }
  return (ms: number) => format.format(new Date(ms));
};

/**
 * A cluster's events over the picked range (the last `pastHours`, or `startDate`–`endDate`) in 24h bars counted from
 * the range's start. The bars cover exactly the range the Events table reads, so 720h is 30 bars ending now, and a
 * picker range (local midnights) is one bar per local day.
 */
export async function getClusterDaily(input: z.input<typeof ClusterDailySchema>): Promise<ClusterDaily> {
  const { pastHours, startDate, endDate, tz, ...scopeInput } = ClusterDailySchema.parse(input);
  const { projectId, signalId, clusterId } = await resolveClusterScope(scopeInput);

  const now = Date.now();
  const end = endDate ? new Date(endDate).getTime() : now;
  const start = startDate ? new Date(startDate).getTime() : end - (pastHours ?? CLUSTER_WINDOW_DAYS * 24) * 3_600_000;
  if (start > end) throw new ApiError("startDate must not be after endDate", 400);

  // The picker's single-day range has start = end at midnight: read it as that whole day.
  const count = Math.min(MAX_RANGE_DAYS, Math.max(1, Math.ceil((end - start) / DAY_MS)));
  const to = start === end ? start + DAY_MS : Math.min(end, start + count * DAY_MS);
  // Each bar is labelled by the viewer's date at its middle, clamped into the window so a 1h range reads as today.
  const label = dateIn(tz);
  const days = Array.from({ length: count }, (_, i) =>
    label(Math.min(start + i * DAY_MS + DAY_MS / 2, Math.max(start, to - 1)))
  );

  const chTime = (ms: number) => new Date(ms).toISOString().replace("T", " ").replace("Z", "");
  const rows = await executeQuery<{ bucket: number; count: number }>({
    query: `
      SELECT least(intDiv(dateDiff('millisecond', toDateTime64({from: String}, 9, 'UTC'), timestamp), ${DAY_MS}), {last: Int64}) AS bucket,
        count() AS count
      FROM signal_events
      WHERE signal_id = {signalId: UUID} AND has(leaf_clusters, {clusterId: UUID})
        AND timestamp >= toDateTime64({from: String}, 9, 'UTC') AND timestamp <= toDateTime64({to: String}, 9, 'UTC')
      GROUP BY bucket
    `,
    parameters: { signalId, clusterId, from: chTime(start), to: chTime(to), last: count - 1 },
    projectId,
  });
  const daily = Array.from({ length: count }, () => 0);
  for (const r of rows) daily[Number(r.bucket)] += Number(r.count);
  return { days, daily, start: new Date(start).toISOString() };
}
