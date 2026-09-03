import { eq } from "drizzle-orm";

import { retentionDays } from "@/lib/billing/retention";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { projects } from "@/lib/db/migrations/schema";

// Mirrors `RETENTION_GRACE_DAYS` / `NEVER_EXPIRES` in app-server `utils/retention.rs`.
const RETENTION_GRACE_DAYS = 7;
const NEVER_EXPIRES = "toDateTime('2106-01-01 00:00:00', 'UTC')";

// TTL'd tables and the column their `expires_at` is anchored on.
const RETENTION_TABLES: { table: string; anchor: string }[] = [
  { table: "traces_agg", anchor: "start_time" },
  { table: "traces_static", anchor: "start_time" },
  { table: "deduped_content", anchor: "last_seen_at" },
];

// Rows are stamped with `expires_at` at ingest from the tier active at the
// time, so an upgrade must push existing rows out or the TTL keeps deleting
// on the old schedule. Only ever extends (greatest), never shortens: a
// downgrade is enforced by the read-side cutoff, and the old rows age out on
// their own. Mutations run async (default mutations_sync=0) and are best-effort.
export const extendRetentionForWorkspace = async (workspaceId: string, tierName: string): Promise<void> => {
  const days = retentionDays(tierName);
  const newExpiry =
    days === null ? NEVER_EXPIRES : `toDateTime({anchor}) + INTERVAL ${days + RETENTION_GRACE_DAYS} DAY`;

  const projectIds = (
    await db.select({ id: projects.id }).from(projects).where(eq(projects.workspaceId, workspaceId))
  ).map((p) => p.id);
  if (projectIds.length === 0) {
    return;
  }

  await Promise.all(
    RETENTION_TABLES.map(({ table, anchor }) =>
      clickhouseClient.command({
        query: `
          ALTER TABLE ${table}
          UPDATE expires_at = greatest(expires_at, ${newExpiry.replace("{anchor}", anchor)})
          WHERE project_id IN {projectIds: Array(UUID)}
        `,
        query_params: { projectIds },
      })
    )
  );
};
