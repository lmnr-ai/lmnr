import { sql } from "drizzle-orm";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

// Each ClickHouse `_v0` view Laminar exposes is a project-parameterized view
// function ({project_id:UUID}), so it can't be counted directly. Instead we map
// every exposed view to the physical table it reads from and pull instant,
// cheap row counts from system.tables.total_rows — no full scans, no FINAL, no
// per-project iteration. Keep this in sync with query-engine's
// _setup_default_tables() view registry.
const VIEW_BACKING_TABLES: Record<string, string> = {
  spans_v0: "spans",
  traces_v0: "traces_replacing",
  dataset_datapoints_v0: "dataset_datapoints",
  dataset_datapoint_versions_v0: "dataset_datapoints",
  evaluation_datapoints_v0: "evaluation_datapoints",
  signal_runs_v0: "signal_runs",
  signal_events_v0: "signal_events",
  logs_v0: "logs",
  labeling_queue_items_v0: "labeling_queue_items",
  clusters_v0: "signal_event_clusters",
  signal_events_all_v0: "signal_events",
  event_clusters_all_v0: "events_to_clusters",
};

interface TableRow {
  name: string;
  total_rows: string | number | null;
}

export const collectViewCounts = async (): Promise<Record<string, number>> => {
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

// Common personal-email providers. A deployment whose users are all on these
// has no meaningful "company domain", so we fall back to the instance UUID as
// the PostHog identity rather than collapsing every gmail-only install into one.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.de",
  "mail.ru",
  "yandex.ru",
  "yandex.com",
  "qq.com",
  "163.com",
  "126.com",
  "hey.com",
  "zoho.com",
  "fastmail.com",
  "tutanota.com",
  // Placeholder domains common in dev installs.
  "example.com",
  "example.org",
  "test.com",
  "localhost",
]);

export interface UserDomainStats {
  // domain -> number of users, sorted by count descending.
  domains: Record<string, number>;
  // Most common non-freemail domain, or null when every user is on a personal
  // provider (or there are no users yet).
  primaryDomain: string | null;
  userCount: number;
}

export const collectUserDomains = async (): Promise<UserDomainStats> => {
  const rows = await db.execute<{ domain: string; count: string | number }>(
    sql`
      SELECT lower(split_part(email, '@', 2)) AS domain, count(*) AS count
      FROM users
      WHERE position('@' in email) > 0
      GROUP BY 1
      ORDER BY count(*) DESC, 1
    `
  );

  const domains: Record<string, number> = {};
  let userCount = 0;
  let primaryDomain: string | null = null;
  for (const row of rows) {
    if (!row.domain) {
      continue;
    }
    const count = Number(row.count);
    domains[row.domain] = count;
    userCount += count;
    if (primaryDomain === null && !FREE_EMAIL_DOMAINS.has(row.domain)) {
      primaryDomain = row.domain;
    }
  }

  return { domains, primaryDomain, userCount };
};

// Snapshot of which optional features the deployment has turned on. Booleans
// only — no values, endpoints, or credentials.
export const collectFeatureFlags = (): Record<string, boolean> => {
  const flags: Feature[] = [
    Feature.SIGNALS,
    Feature.CLUSTERING,
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

export interface TelemetrySnapshot {
  properties: Record<string, unknown>;
  setProperties: Record<string, unknown>;
  // Most common non-freemail email domain across the deployment's users; used
  // as the PostHog distinctId so a self-hosted install is identified by the
  // company running it instead of an opaque UUID.
  primaryDomain: string | null;
}

export const collectSnapshot = async (): Promise<TelemetrySnapshot> => {
  const counts = await collectViewCounts();
  const countProps = Object.fromEntries(Object.entries(counts).map(([view, n]) => [`count_${view}`, n]));

  const features = collectFeatureFlags();
  const featureProps = Object.fromEntries(Object.entries(features).map(([f, on]) => [`feature_${f}`, on]));

  const { domains, primaryDomain, userCount } = await collectUserDomains();

  const version = process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || "unknown";
  const environment = process.env.ENVIRONMENT || "unknown";
  // Optional operator-set label for known accounts; absent by default.
  const label = process.env.LAMINAR_TELEMETRY_LABEL;

  const common = {
    version,
    environment,
    user_count: userCount,
    user_domains: domains,
    ...(primaryDomain ? { primary_domain: primaryDomain } : {}),
    ...countProps,
    ...featureProps,
    ...(label ? { label } : {}),
  };

  return {
    properties: common,
    // Mirror onto person properties so the latest snapshot is queryable on the
    // PostHog person without scanning events.
    setProperties: common,
    primaryDomain,
  };
};
