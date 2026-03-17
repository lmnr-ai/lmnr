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
      const { subscriptionTiers, modelCosts } = await import("@/lib/db/migrations/schema.ts");
      const { db } = await import("@/lib/db/drizzle.ts");

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
        } catch (error) {
          console.error("Failed to apply ClickHouse migrations:", error);
          throw error;
        }
      };
      // Run Postgres migrations and data initialization
      await db.execute("ALTER DATABASE postgres REFRESH COLLATION VERSION");
      await migrate(db as any, { migrationsFolder: "lib/db/migrations" });
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
  }
}

export const onRequestError = Sentry.captureRequestError;
