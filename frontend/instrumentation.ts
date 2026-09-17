// Yes, this file is called instrumentation.ts, but it's not actually used to instrument the app.
// Apparently, this is the suggested way to run startup hooks in Next.js:
// https://github.com/vercel/next.js/discussions/15341#discussioncomment-7091594
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config.ts");
  }

  // prevent this from running in the edge runtime for the second time
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { Feature, isFeatureEnabled } = await import("@/lib/features/features.ts");
    if (isFeatureEnabled(Feature.LOCAL_DB)) {
      const { sql } = await import("drizzle-orm");
      const { migrate } = await import("drizzle-orm/postgres-js/migrator");
      const { subscriptionTiers, modelCosts, signals, projects } = await import("@/lib/db/migrations/schema.ts");
      const { db, getDatabaseConfig, getPostgresSchema } = await import("@/lib/db/drizzle.ts");

      const initializeData = async () => {
        const initialData = require("@/lib/db/initial-data.json");
        for (const entry of initialData) {
          const tableName: string = entry.table;
          const tables: Record<string, any> = {
            subscription_tiers: subscriptionTiers,
          };
          const table = tables[tableName];
          if (!table) {
            continue;
          }
          const rows: Record<string, unknown>[] = entry.data.map((row: Record<string, unknown>) =>
            Object.fromEntries(
              Object.entries(row).map(([k, v]) =>
                // camelCase the keys for drizzle
                [k.replace(/(_[a-z])/g, (m) => m[1].toUpperCase()), v]
              )
            )
          );

          await db
            .insert(table)
            .values(rows)
            .onConflictDoUpdate({
              target: table.id,
              set: Object.fromEntries(Object.keys(entry.data[0]).map((key) => [key, sql.raw(`excluded.${key}`)])),
            });
        }
      };

      const PRICES_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

      const SHORT_NAME_PREFIXES = ["mistral", "xai", "minimax", "moonshot"];

      const initializeModelCosts = async (): Promise<boolean> => {
        try {
          const response = await fetch(PRICES_URL, { signal: AbortSignal.timeout(30000) });
          if (!response.ok) {
            throw new Error(`Failed to fetch model prices: ${response.status} ${response.statusText}`);
          }
          const data: Record<string, unknown> = await response.json();

          const rows = new Map<string, unknown>();
          for (const [modelName, info] of Object.entries(data)) {
            if (modelName === "sample_spec") continue;
            const lowerName = modelName.toLowerCase();
            rows.set(lowerName, info);

            if (SHORT_NAME_PREFIXES.some((p) => lowerName.startsWith(p))) {
              const shortName = lowerName.includes("/") ? lowerName.split("/").pop()! : lowerName;
              if (shortName !== lowerName && !rows.has(shortName)) {
                rows.set(shortName, info);
              }
            }
          }

          const allRows = Array.from(rows.entries()).map(([model, costs]) => ({
            model,
            costs,
          }));

          await db
            .insert(modelCosts)
            .values(allRows)
            .onConflictDoUpdate({
              target: modelCosts.model,
              set: {
                costs: sql.raw(`excluded.costs`) as any,
                updatedAt: sql.raw(`now()`) as any,
              },
            });

          console.log(`Upserted ${allRows.length} rows into model_costs`);
          return true;
        } catch (error) {
          console.error("Failed to initialize model costs:", error);
          console.log("Continuing without model costs data...");
          return false;
        }
      };

      // `CREATE OR REPLACE` so credential rotation is picked up on next boot
      // without tripping the clickhouse-migrations MD5 checksum guard (which is
      // why these live here instead of in their migrations).
      // Multi-replica boots race the DDL — CH serialises it, but each replace
      // wipes the COMPLEX_KEY_CACHE, so rolling deploys briefly cold-miss.
      // Acceptable: layout is lazy (no preload) and source lookups hit each
      // table's PK exactly.
      const escapeChCreds = (v: string) => v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

      const dictCacheOptions = () => {
        const sizeInCells = Number(process.env.CH_CONTENT_DICT_SIZE_IN_CELLS) || 262144;
        return `
            SIZE_IN_CELLS ${sizeInCells}
            ALLOW_READ_EXPIRED_KEYS 1
            MAX_THREADS_FOR_UPDATES 8
            QUERY_WAIT_TIMEOUT_MILLISECONDS 15000`;
      };

      // Dictionaries the `_v0` / `_v1` views read. Key columns mirror each
      // source's ORDER BY; a hash is declared `String` because dict attrs
      // can't be `FixedString(N)` — CH coerces the table's `FixedString(32)`
      // transparently. CREATE VIEW does not resolve dictionary attributes, so
      // recreating the dicts after migrations is enough for views to see
      // new attributes.
      const VIEW_DICTS: {
        name: string;
        keyColumns: string[];
        attrColumns: string[];
        sourceTable: string;
      }[] = [
        // Content dedup, current: group-scoped (session, else trace) so one
        // trace's lookups land in adjacent granules. `content_masks` /
        // `pii_checked` feed the masked branch of `spans_v1` (migration 66).
        {
          name: "unique_content_dict",
          keyColumns: ["project_id UUID", "group_id String", "content_hash String"],
          attrColumns: ["content String", "content_masks Array(Tuple(UInt32, UInt32, String))", "pii_checked Bool"],
          sourceTable: "unique_content",
        },
        // Content dedup, legacy: project-scoped, read-only fallback for spans
        // ingested before migration 64. No writer, so no PII columns: its
        // rows are unavailable under a masking policy.
        {
          name: "deduped_content_dict",
          keyColumns: ["project_id UUID", "content_hash String"],
          attrColumns: ["content String"],
          sourceTable: "deduped_content",
        },
      ];

      const ensureContentDicts = async () => {
        const { clickhouseClient } = await import("@/lib/clickhouse/client.ts");
        const user = escapeChCreds(process.env.CLICKHOUSE_USER || "ch_user");
        const password = escapeChCreds(process.env.CLICKHOUSE_PASSWORD || "ch_passwd");
        const db = escapeChCreds(process.env.CLICKHOUSE_DB || "default");

        for (const { name, keyColumns, attrColumns, sourceTable } of VIEW_DICTS) {
          const primaryKey = keyColumns.map((c) => c.split(" ")[0]).join(", ");
          await clickhouseClient.command({
            query: `
              CREATE OR REPLACE DICTIONARY ${name}
              (
                  ${[...keyColumns, ...attrColumns].join(",\n                  ")}
              )
              PRIMARY KEY ${primaryKey}
              SOURCE(CLICKHOUSE(
                  USER '${user}'
                  PASSWORD '${password}'
                  DB '${db}'
                  TABLE '${sourceTable}'
              ))
              LAYOUT(COMPLEX_KEY_CACHE(${dictCacheOptions()}))
              LIFETIME(MIN 1800 MAX 3600)
            `,
          });
        }
      };

      // Hashed in-memory dict over signal_event_clusters (no centroids). Views
      // resolve cluster names/paths with dictGet instead of joining FINAL.
      //
      // `path` is NOT stored anywhere: the source query walks `parent_id`
      // recursively and materializes the ancestor chain in dict memory at load
      // time, so it costs one pass per reload rather than one per query, and a
      // reparent needs no descendant rewrites on disk. Measured on 26.5 over a
      // 104k-cluster signal: 186ms to build every chain. Depth is capped at 8,
      // the ceiling `ClusteringTuning::validate` allows for CLUSTERING_MAX_DEPTH
      // (default 3) -- raise both together or paths silently truncate.
      // `dictGetHierarchy` would do this natively but is UInt64-key only.
      // COMPLEX_KEY_HASHED, not CACHE: whole table resident. Cloud creates this
      // by hand (LOCAL_DB is off). Every reload rebuilds the entire dict, so the
      // LIFETIME is a cost dial, not a freshness one -- at prod's 261k clusters
      // that is 0.68s and 268 MiB per reload. 30-60s trades a rename taking up
      // to a minute to appear for ~3x fewer reloads.
      const ensureClustersDict = async () => {
        const { clickhouseClient } = await import("@/lib/clickhouse/client.ts");
        const user = escapeChCreds(process.env.CLICKHOUSE_USER || "ch_user");
        const password = escapeChCreds(process.env.CLICKHOUSE_PASSWORD || "ch_passwd");
        const db = escapeChCreds(process.env.CLICKHOUSE_DB || "default");

        await clickhouseClient.command({
          query: `
            CREATE OR REPLACE DICTIONARY clusters_dict
            (
                project_id UUID,
                id UUID,
                signal_id UUID,
                name String,
                level UInt8,
                parent_id UUID,
                path Array(UUID),
                num_signal_events UInt32,
                num_children_clusters UInt16,
                created_at DateTime64(9, 'UTC'),
                updated_at DateTime64(9, 'UTC')
            )
            PRIMARY KEY project_id, id
            SOURCE(CLICKHOUSE(
                USER '${user}'
                PASSWORD '${password}'
                DB '${db}'
                QUERY 'WITH RECURSIVE anc AS (
                           SELECT project_id, signal_id, id AS start_id, parent_id, 1 AS depth
                           FROM signal_event_clusters FINAL
                           WHERE notEmpty(parent_id)
                         UNION ALL
                           SELECT a.project_id, a.signal_id, a.start_id, c.parent_id, a.depth + 1
                           FROM anc AS a
                           INNER JOIN signal_event_clusters AS c FINAL
                             ON c.project_id = a.project_id AND c.signal_id = a.signal_id
                                AND c.id = a.parent_id
                           -- practically the depth is maxed at 3, but just add some buffer;
                           -- the limit will be hit by parent_id emptiness
                           WHERE a.depth < 8
                             AND notEmpty(c.parent_id)
                       )
                       SELECT c.project_id, c.id, c.signal_id, c.name, c.level, c.parent_id,
                              p.path,
                              c.num_signal_events, c.num_children_clusters, c.created_at, c.updated_at
                       FROM signal_event_clusters AS c FINAL
                       LEFT JOIN (
                           SELECT project_id, signal_id, start_id,
                                  arrayMap(x -> x.2, arraySort(x -> x.1, groupArray((depth, parent_id)))) AS path
                           FROM anc GROUP BY project_id, signal_id, start_id
                       ) AS p
                         ON p.project_id = c.project_id AND p.signal_id = c.signal_id
                            AND p.start_id = c.id'
                INVALIDATE_QUERY 'SELECT max(updated_at), count() FROM signal_event_clusters'
            ))
            LAYOUT(COMPLEX_KEY_HASHED())
            LIFETIME(MIN 30 MAX 60)
          `,
        });
      };

      const initializeClickHouse = async () => {
        try {
          const { migration } = await import("clickhouse-migrations");
          const { join } = await import("path");

          const migrationsHome = join(process.cwd(), "lib/clickhouse/migrations");

          await migration(
            migrationsHome,
            process.env.CLICKHOUSE_URL || "http://localhost:8123",
            process.env.CLICKHOUSE_USER || "ch_user",
            process.env.CLICKHOUSE_PASSWORD || "ch_passwd",
            process.env.CLICKHOUSE_DB || "default",
            "ENGINE=Atomic", // db_engine
            String(Number(process.env.CH_MIGRATIONS_TIMEOUT) || 30000) // timeout as string
          );

          await ensureContentDicts();
          await ensureClustersDict();
        } catch (error) {
          console.error("Failed to apply ClickHouse migrations:", error);
          throw error;
        }
      };
      // Run Postgres migrations and data initialization
      // Best-effort: requires DB owner / superuser, which managed Postgres
      // (RDS, Supabase, Neon, Cloud SQL, Azure) doesn't grant to app roles.
      try {
        const dbName = getDatabaseConfig().database;
        const quotedDbName = `"${dbName.replace(/"/g, '""')}"`;
        await db.execute(`ALTER DATABASE ${quotedDbName} REFRESH COLLATION VERSION`);
      } catch (error) {
        console.warn(
          "Skipping REFRESH COLLATION VERSION (insufficient privileges or unsupported):",
          error instanceof Error ? error.message : String(error)
        );
      }
      const postgresSchema = getPostgresSchema();
      // Any case variant of "public" is the default schema (which always exists),
      // so we never create it or relocate the migrations tracker into it. Note an
      // unquoted identifier in search_path folds to lowercase, so a value like
      // "PUBLIC" resolves to "public" at query time — quoting it into CREATE SCHEMA
      // would create a SEPARATE "PUBLIC" schema that queries never reach.
      const isPublicSchema = postgresSchema.toLowerCase() === "public";
      if (postgresSchema && !isPublicSchema && process.env.POSTGRES_CREATE_SCHEMA !== "false") {
        try {
          await db.execute(`CREATE SCHEMA IF NOT EXISTS "${postgresSchema.replace(/"/g, '""')}"`);
        } catch (error) {
          console.warn(
            `Skipping CREATE SCHEMA "${postgresSchema}" (insufficient privileges or pre-provisioned); set POSTGRES_CREATE_SCHEMA=false to silence:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
      // Track migrations inside the configured schema so a Laminar DB can coexist
      // with another Drizzle-managed service in the same instance. An unset or
      // "public" (any case) schema keeps the tracker in the standard "drizzle"
      // schema — so existing public deployments are untouched and don't re-run
      // migrations (relocating the tracker would make the migrator see no prior
      // migration and re-run all of them).
      await migrate(db as any, {
        migrationsFolder: "lib/db/migrations",
        ...(postgresSchema && !isPublicSchema ? { migrationsSchema: postgresSchema } : {}),
      });
      console.log("✓ Postgres migrations applied successfully");
      await initializeData();
      console.log("✓ Postgres data initialized successfully");

      // Folds legacy playground keys into workspace LLM profiles and deletes them; no-op once the table is empty.
      try {
        const { migrateProviderApiKeys } = await import("@/lib/db/migrate-provider-api-keys.ts");
        const migrated = await migrateProviderApiKeys({ deleteLegacyRows: true });
        if (migrated.profilesCreated > 0) {
          console.log(`✓ Legacy provider API keys migrated into ${migrated.profilesCreated} LLM profile(s)`);
        }
      } catch (error) {
        console.error("Legacy provider API key migration failed (will retry on next start):", error);
      }

      // Fetch model costs and populate the database
      console.log("Fetching model costs...");
      const modelCostsOk = await initializeModelCosts();
      if (modelCostsOk) {
        console.log("✓ Model costs initialized successfully");
      }

      // Run ClickHouse schema application
      console.log("Applying ClickHouse schema. This may take a while...");
      await initializeClickHouse();
      console.log("✓ ClickHouse schema applied successfully");

      // Backfill historical traces_replacing rows into traces_agg/traces_static
      // (LAM-2018), then copy events_to_clusters → signal_event_summaries and
      // stamp traces_agg memberships. Deliberately NOT awaited — the walk covers
      // up to 90 days in 6h batches and must never delay serving traffic.
      // Resumes from the destination watermark on the next boot if it dies partway.
      //
      // Strictly sequential, and gated on what the first call RETURNS rather than
      // on its status record: the copy INNER JOINs traces_agg for each trace's
      // start_time, and that record is absent on every boot when REDIS_URL is
      // unset, so reading it back would defer the copy forever.
      void (async () => {
        const { startTracesAggBackfill } = await import("@/lib/clickhouse/scripts/backfill-traces-agg.ts");
        const { startSignalClustersBackfill } = await import("@/lib/clickhouse/scripts/backfill-signal-clusters.ts");
        const tracesAggComplete = await startTracesAggBackfill();
        await startSignalClustersBackfill(tracesAggComplete);
      })().catch((error) => console.error("Failed to run ClickHouse backfills:", error));

      // Seed default signals for projects that don't have any. Same path as
      // workspace create: one transaction for signal + trigger + v1 + alerts.
      const { DEFAULT_SIGNAL } = await import("@/lib/db/default-signals.ts");
      const { createSignal } = await import("@/lib/actions/signals/index.ts");

      const initializeDefaultSignals = async () => {
        try {
          // Find all project IDs that already have at least one signal
          const projectsWithSignals = await db.selectDistinct({ projectId: signals.projectId }).from(signals);

          const projectIdsWithSignals = new Set(projectsWithSignals.map((r) => r.projectId));

          // Get all projects
          const allProjects = await db.select({ id: projects.id }).from(projects);

          // Filter to projects that have no signals
          const projectsWithoutSignals = allProjects.filter((p) => !projectIdsWithSignals.has(p.id));

          if (projectsWithoutSignals.length === 0) {
            console.log("No projects need default signals, skipping seeding");
            return;
          }

          let seeded = 0;
          for (const project of projectsWithoutSignals) {
            try {
              await createSignal(
                {
                  projectId: project.id,
                  name: DEFAULT_SIGNAL.name,
                  prompt: DEFAULT_SIGNAL.prompt,
                  structuredOutput: DEFAULT_SIGNAL.structuredOutputSchema,
                },
                { requireLlmProfile: false }
              );
              seeded++;
            } catch (err) {
              console.error(`Failed to seed default signal for project ${project.id}:`, err);
            }
          }

          console.log(`Seeded default signals for ${seeded}/${projectsWithoutSignals.length} project(s)`);
        } catch (error) {
          console.error("Failed to initialize default signals:", error);
          console.log("Continuing without default signals...");
        }
      };
      await initializeDefaultSignals();

      // Run Quickwit index initialization
      const initializeQuickwit = async () => {
        if (!process.env.QUICKWIT_SEARCH_URL) {
          console.warn("Skipping Quickwit initialization: QUICKWIT_SEARCH_URL is not set.");
          return;
        }
        try {
          const { initializeQuickwitIndexes } = await import("@/lib/quickwit/migrations.ts");
          await initializeQuickwitIndexes();
        } catch (error) {
          console.error("Failed to initialize Quickwit indexes:", error);
          console.log("Continuing without Quickwit indexes...");
        }
      };
      await initializeQuickwit();
    } else {
      console.log("Local DB is not enabled, skipping migrations and initial data");
    }
    if (process.env.LMNR_PROJECT_API_KEY) {
      const { LaminarAiSdkTelemetry } = await import("@lmnr-ai/lmnr");
      const { registerTelemetry } = await import("ai");
      console.log("Initializing Laminar");
      // LaminarAiSdkTelemetry's constructor calls Laminar.initialize() itself
      // (reading projectApiKey from LMNR_PROJECT_API_KEY), so no explicit init.
      // The env-var guard stays: without a key that self-init would throw.
      registerTelemetry(new LaminarAiSdkTelemetry());
    }

    // Anonymous self-hosted usage telemetry. No-ops on Laminar Cloud and when
    // operators opt out (see Feature.TELEMETRY). Fire-and-forget — never blocks
    // or fails boot.
    const { startTelemetry } = await import("@/lib/telemetry/index.ts");
    startTelemetry().catch((error) => console.error("Failed to start telemetry:", error));
  }
}

export const onRequestError = Sentry.captureRequestError;
