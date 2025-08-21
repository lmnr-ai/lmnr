// Yes, this file is called instrumentation.ts, but it's not actually used to instrument the app.
// Apparently, this is the suggested way to run startup hooks in Next.js:
// https://github.com/vercel/next.js/discussions/15341#discussioncomment-7091594

import { registerOTel } from "@vercel/otel";

const INITIAL_CH_SCHEMA_FILE = "0000-initial.sql";

export async function register() {
  if (process.env.ENVIRONMENT === "PRODUCTION") {
    registerOTel({ serviceName: "lmnr-web" });
  }
  // prevent this from running in the edge runtime for the second time
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { Feature, isFeatureEnabled } = await import("@/lib/features/features.ts");
    if (isFeatureEnabled(Feature.LOCAL_DB)) {
      const { sql } = await import("drizzle-orm");
      const { migrate } = await import("drizzle-orm/postgres-js/migrator");
      const { llmPrices, subscriptionTiers, userSubscriptionTiers } = await import("@/lib/db/migrations/schema.ts");
      const { db } = await import("@/lib/db/drizzle.ts");

      const initializeData = async () => {
        const initialData = require("@/lib/db/initial-data.json");
        for (const entry of initialData) {
          const tableName: string = entry.table;
          const tables: Record<string, any> = {
            subscription_tiers: subscriptionTiers,
            llm_prices: llmPrices,
            user_subscription_tiers: userSubscriptionTiers,
          };
          const table = tables[tableName];
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

      const initializeClickHouse = async () => {
        try {
          const { clickhouseClient } = await import("@/lib/clickhouse/client.js");
          const { readFileSync, readdirSync } = await import("fs");
          const { join } = await import("path");

          for (const file of readdirSync("lib/clickhouse/migrations")) {
            const schemaSql = readFileSync(join(process.cwd(), "lib/clickhouse/migrations", file), "utf-8");
            const statements = schemaSql
              .split(";")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);

            for (const statement of statements) {
              try {
                await clickhouseClient.exec({ query: statement });
              } catch (error) {
                if ((error as { type: string }).type === "DUPLICATE_COLUMN") {
                  console.warn("Failed to apply ClickHouse statement:", statement, "because column already exists");
                  continue;
                } else {
                  throw error;
                }
              }
            }
          }
        } catch (error) {
          console.error("Failed to apply ClickHouse schema:", error);
        }
      };
      // Run Postgres migrations and data initialization
      await migrate(db as any, { migrationsFolder: "lib/db/migrations" });
      console.log("✓ Postgres migrations applied successfully");
      await initializeData();
      console.log("✓ Postgres data initialized successfully");

      // Run ClickHouse schema application
      console.log("Applying ClickHouse schema. This may take a while...");
      await initializeClickHouse();
      console.log("✓ ClickHouse schema applied successfully");
    } else {
      console.log("Local DB is not enabled, skipping migrations and initial data");
    }
  }
}
