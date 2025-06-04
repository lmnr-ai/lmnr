// Yes, this file is called instrumentation.ts, but it's not actually used to instrument the app.
// Apparently, this is the suggested way to run startup hooks in Next.js:
// https://github.com/vercel/next.js/discussions/15341#discussioncomment-7091594

const INITIAL_CH_SCHEMA_FILE = "0000-initial.sql";

export async function register() {
  // prevent this from running in the edge runtime for the second time
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { Feature, isFeatureEnabled } = await import("lib/features/features");
    if (isFeatureEnabled(Feature.LOCAL_DB)) {
      const { sql } = await import("drizzle-orm");
      const { migrate } = await import("drizzle-orm/postgres-js/migrator");
      const { llmPrices, subscriptionTiers, userSubscriptionTiers } = await import("lib/db/migrations/schema");
      const { db } = await import("lib/db/drizzle");

      const initializeData = async () => {
        const initialData = require("lib/db/initial-data.json");
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

          await db.insert(table).values(rows).onConflictDoUpdate({
            target: table.id,
            set: Object.fromEntries(
              Object.keys(entry.data[0]).map(key => [key, sql.raw(`excluded.${key}`)])
            )
          });
        }
      };

      const initializeClickHouse = async () => {
        try {
          const { clickhouseClient } = await import("lib/clickhouse/client");

          const { readFileSync, readdirSync } = await import("fs");
          const { join } = await import("path");

          // Check if any tables already exist
          let hasExistingTables = false;
          try {
            const result = await clickhouseClient.query({ query: "SHOW TABLES" });
            const tables = await result.json();
            hasExistingTables = tables.data && tables.data.length > 0;
            if (hasExistingTables) {
              console.log("Existing ClickHouse tables detected, skipping initial schema file");
            }
          } catch (error) {
            console.log("Could not check for existing tables, proceeding with all migrations");
          }

          let migrationFiles = readdirSync("lib/clickhouse/migrations");

          // Skip initial schema file if tables already exist
          if (hasExistingTables) {
            migrationFiles = migrationFiles.filter(file => file !== INITIAL_CH_SCHEMA_FILE);
          }

          console.log(`Processing ${migrationFiles.length} ClickHouse migration files...`);

          for (const file of migrationFiles) {
            const schemaSql = readFileSync(join(process.cwd(), "lib/clickhouse/migrations", file), "utf-8");
            const statements = schemaSql
              .split(";")
              .map(s => s.trim())
              .filter(s => s.length > 0);

            for (const statement of statements) {
              await clickhouseClient.exec({ query: statement });
              if (statement.toLowerCase().startsWith("create table")) {
                // Make CREATE TABLE statements idempotent
                const idempotentStatement = statement.replace(
                  /CREATE TABLE(?!\s+IF NOT EXISTS)/i, "CREATE TABLE IF NOT EXISTS"
                );
                await clickhouseClient.exec({ query: idempotentStatement });
              } else if (statement.toLowerCase().startsWith("alter table")) {
                try {
                  await clickhouseClient.exec({ query: statement });
                } catch (error) {
                  if ((error as { type: string }).type === "DUPLICATE_COLUMN") {
                    console.warn(
                      "Failed to apply ClickHouse statement:",
                      statement,
                      "because column already exists"
                    );
                    continue;
                  } else {
                    throw error;
                  }
                }
              }
            }

          }
        } catch (error) {
          console.error("Failed to apply ClickHouse schema:", error);
        };
      }
      // Run Postgres migrations and data initialization
      await migrate(db, { migrationsFolder: "lib/db/migrations" });
      console.log("✓ Postgres migrations applied successfully");
      await initializeData();
      console.log("✓ Postgres data initialized successfully");

      // Run ClickHouse schema application
      await initializeClickHouse();
      console.log("✓ ClickHouse schema applied successfully");
    } else {
      console.log("Local DB is not enabled, skipping migrations and initial data");
    }
  }
}
