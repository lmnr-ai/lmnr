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
      const { subscriptionTiers, modelCosts, signals, signalTriggers, projects } =
        await import("@/lib/db/migrations/schema.ts");
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
      // Acceptable: layout is lazy (no preload), source lookups hit each
      // table's PK exactly, and `LIFETIME(MIN 30 MAX 60)` already
      // evicts/refreshes every minute under normal operation.
      const escapeChCreds = (v: string) => v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

      const ensureLlmMessagesDict = async () => {
        const { clickhouseClient } = await import("@/lib/clickhouse/client.ts");
        const user = escapeChCreds(process.env.CLICKHOUSE_USER || "ch_user");
        const password = escapeChCreds(process.env.CLICKHOUSE_PASSWORD || "ch_passwd");
        const db = escapeChCreds(process.env.CLICKHOUSE_DB || "default");

        await clickhouseClient.command({
          query: `
            CREATE OR REPLACE DICTIONARY llm_messages_dict
            (
                project_id UUID,
                trace_id UUID,
                message_hash String,
                content String
            )
            PRIMARY KEY project_id, trace_id, message_hash
            SOURCE(CLICKHOUSE(
                USER '${user}'
                PASSWORD '${password}'
                DB '${db}'
                TABLE 'llm_messages'
            ))
            LAYOUT(COMPLEX_KEY_CACHE(SIZE_IN_CELLS 131072))
            LIFETIME(MIN 30 MAX 60)
          `,
        });
      };

      // Project-scoped dedup dict. Backs the `deduped_content` table for
      // both input/output messages and tool definitions. The `spans_v0`
      // view tries this dict first and falls back to `llm_messages_dict`
      // for legacy spans.
      const ensureDedupedContentDict = async () => {
        const { clickhouseClient } = await import("@/lib/clickhouse/client.ts");
        const user = escapeChCreds(process.env.CLICKHOUSE_USER || "ch_user");
        const password = escapeChCreds(process.env.CLICKHOUSE_PASSWORD || "ch_passwd");
        const db = escapeChCreds(process.env.CLICKHOUSE_DB || "default");

        await clickhouseClient.command({
          query: `
            CREATE OR REPLACE DICTIONARY deduped_content_dict
            (
                project_id UUID,
                content_hash String,
                content String
            )
            PRIMARY KEY project_id, content_hash
            SOURCE(CLICKHOUSE(
                USER '${user}'
                PASSWORD '${password}'
                DB '${db}'
                TABLE 'deduped_content'
            ))
            LAYOUT(COMPLEX_KEY_CACHE(SIZE_IN_CELLS 131072))
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

          await ensureLlmMessagesDict();
          await ensureDedupedContentDict();
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
      if (postgresSchema && process.env.POSTGRES_CREATE_SCHEMA !== "false") {
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
      // explicit "public" schema keeps the tracker in the standard "drizzle"
      // schema — so existing public deployments are untouched and don't re-run
      // migrations (relocating the tracker would make the migrator see no prior
      // migration and re-run all of them).
      await migrate(db as any, {
        migrationsFolder: "lib/db/migrations",
        ...(postgresSchema && postgresSchema !== "public" ? { migrationsSchema: postgresSchema } : {}),
      });
      console.log("✓ Postgres migrations applied successfully");
      await initializeData();
      console.log("✓ Postgres data initialized successfully");

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

      // Seed default signals for projects that don't have any
      const { DEFAULT_SIGNAL, DEFAULT_SIGNAL_TRIGGER_VALUE } = await import("@/lib/db/default-signals.ts");

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
              const [signal] = await db
                .insert(signals)
                .values({
                  projectId: project.id,
                  ...DEFAULT_SIGNAL,
                })
                .onConflictDoNothing()
                .returning({ id: signals.id });

              if (signal) {
                await db.insert(signalTriggers).values({
                  projectId: project.id,
                  signalId: signal.id,
                  value: DEFAULT_SIGNAL_TRIGGER_VALUE,
                });
                seeded++;
              }
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
      const { Laminar } = await import("@lmnr-ai/lmnr");
      console.log("Initializing Laminar");
      Laminar.initialize();
    }

    // Anonymous self-hosted usage telemetry. No-ops on Laminar Cloud and when
    // operators opt out (see Feature.TELEMETRY). Fire-and-forget — never blocks
    // or fails boot.
    const { startTelemetry } = await import("@/lib/telemetry/index.ts");
    startTelemetry().catch((error) => console.error("Failed to start telemetry:", error));
  }
}

export const onRequestError = Sentry.captureRequestError;
