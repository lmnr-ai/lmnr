import { desc, like, sql } from "drizzle-orm";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { users } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { getLicenseStatus, getTrialStartedAt } from "@/lib/license";
import { getInstanceCreatedAt } from "@/lib/telemetry/instance";

// Each ClickHouse `_v0` view Laminar exposes is a project-parameterized view
// function ({project_id:UUID}), so it can't be counted directly. Instead we map
// every exposed view to the physical table it reads from and pull instant,
// cheap row counts from system.tables.total_rows — no full scans, no FINAL, no
// per-project iteration. Keep this in sync with query-engine's
// _setup_default_tables() view registry.
//
// Counts are pre-merge row counts, so tables that fold rows (traces_agg's
// per-batch partials, the ReplacingMergeTrees) read above their logical entity
// count. Fine for a usage-magnitude signal.
const VIEW_BACKING_TABLES: Record<string, string> = {
  spans_v0: "spans",
  traces_v0: "traces_agg",
  dataset_datapoints_v0: "dataset_datapoints",
  dataset_datapoint_versions_v0: "dataset_datapoints",
  evaluation_datapoints_v0: "evaluation_datapoints",
  signal_runs_v0: "signal_runs",
  signal_events_v0: "signal_events",
  logs_v0: "logs",
  labeling_queue_items_v0: "labeling_queue_items",
  clusters_v0: "signal_event_clusters",
  signal_events_all_v0: "signal_events",
  event_clusters_all_v0: "signal_event_summaries",
};

interface TableRow {
  name: string;
  total_rows: string | number | null;
}

const collectViewCounts = async (): Promise<Record<string, number>> => {
  const db = process.env.CLICKHOUSE_DB || "default";
  const result = await clickhouseClient.query({
    query: `
      SELECT name, total_rows
      FROM system.tables
      WHERE database = {db:String}
        AND engine NOT LIKE '%View%'
        AND engine != 'Dictionary'
    `,
    query_params: { db },
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as TableRow[];

  const tableCounts = new Map<string, number>();
  for (const row of rows) {
    tableCounts.set(row.name, Number(row.total_rows ?? 0));
  }

  const counts: Record<string, number> = {};
  for (const [view, table] of Object.entries(VIEW_BACKING_TABLES)) {
    counts[view] = tableCounts.get(table) ?? 0;
  }
  return counts;
};

// Snapshot of which optional features the deployment has turned on. Booleans
// only — no values, endpoints, or credentials.
const collectFeatureFlags = (): Record<string, boolean> => {
  const flags: Feature[] = [
    Feature.SIGNALS,
    Feature.AGENT,
    Feature.SLACK,
    Feature.GITHUB_AUTH,
    Feature.GOOGLE_AUTH,
    Feature.AZURE_AUTH,
    Feature.OKTA_AUTH,
    Feature.KEYCLOAK_AUTH,
    Feature.EMAIL_AUTH,
    Feature.SEND_EMAIL,
  ];
  return Object.fromEntries(flags.map((f) => [f, isFeatureEnabled(f)]));
};

const toIso = (value: string | Date | null): string | null => (value ? new Date(value).toISOString() : null);

// A trial that keeps restarting on an instance installed long ago shows up as
// trial_started_at drifting away from instance_created_at.
const collectTrialDates = async (): Promise<Record<string, string | null>> => {
  const [trialStartedAt, instanceCreatedAt] = await Promise.all([
    getTrialStartedAt().catch(() => null),
    getInstanceCreatedAt().catch(() => null),
  ]);
  return { trial_started_at: toIso(trialStartedAt), instance_created_at: toIso(instanceCreatedAt) };
};

const MAX_EMAIL_DOMAINS = 20;

// Domains only, never addresses: they say which companies run an instance.
const collectEmailDomains = async (): Promise<string[]> => {
  const domain = sql<string>`lower(split_part(${users.email}, '@', 2))`;
  const rows = await db
    .select({ domain })
    .from(users)
    .where(like(users.email, "%@%"))
    .groupBy(domain)
    .orderBy(desc(sql`count(*)`), domain)
    .limit(MAX_EMAIL_DOMAINS);
  return rows.map((row) => row.domain);
};

export interface TelemetrySnapshot {
  properties: Record<string, unknown>;
  setProperties: Record<string, unknown>;
}

export const collectSnapshot = async (): Promise<TelemetrySnapshot> => {
  const [counts, license, emailDomains] = await Promise.all([
    collectViewCounts(),
    getLicenseStatus(),
    collectEmailDomains().catch((error) => {
      console.error("Failed to collect telemetry email domains:", error);
      return [];
    }),
  ]);
  const trialDates = license ? await collectTrialDates() : {};
  const countProps = Object.fromEntries(Object.entries(counts).map(([view, n]) => [`count_${view}`, n]));

  const features = collectFeatureFlags();
  const featureProps = Object.fromEntries(Object.entries(features).map(([f, on]) => [`feature_${f}`, on]));

  const version = process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || "unknown";
  const environment = process.env.ENVIRONMENT || "unknown";
  // Optional operator-set label, so an operator can name the deployment.
  const label = process.env.LAMINAR_TELEMETRY_LABEL;

  const common = {
    version,
    environment,
    // Status only, never the customer or key. "none" for an OSS app-server.
    license_status: license?.status ?? "none",
    ...trialDates,
    // Most users first.
    email_domains: emailDomains,
    ...countProps,
    ...featureProps,
    ...(label ? { label } : {}),
  };

  return {
    properties: common,
    // Mirror onto person properties so the latest snapshot is queryable on the
    // PostHog person without scanning events.
    setProperties: common,
  };
};
