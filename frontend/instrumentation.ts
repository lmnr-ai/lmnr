// Yes, this file is called instrumentation.ts, but it's not actually used to instrument the app.
// Apparently, this is the suggested way to run startup hooks in Next.js:
// https://github.com/vercel/next.js/discussions/15341#discussioncomment-7091594

export async function register() {
  // prevent this from running in the edge runtime for the second time
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { Feature, isFeatureEnabled } = await import("lib/features/features");
    if (isFeatureEnabled(Feature.LOCAL_DB)) {
      const { migrate } = await import("drizzle-orm/postgres-js/migrator");
      const { llmPrices, pipelineTemplates, subscriptionTiers } = await import("lib/db/migrations/schema");
      const { db } = await import("lib/db/drizzle");

      const initializeData = async () => {
        const initialData = require("lib/db/initial-data.json");
        for (const entry of initialData) {
          const tableName: string = entry.table;
          const tables: Record<string, any> = {
            subscription_tiers: subscriptionTiers,
            pipeline_templates: pipelineTemplates,
            llm_prices: llmPrices,
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

          // TODO: figure out do update here
          await db.insert(table).values(rows).onConflictDoNothing();
        }
      };

      await migrate(db, { migrationsFolder: "lib/db/migrations" });
      await initializeData();
    } else {
      console.log("Local DB is not enabled, skipping migrations and seeding");
    }
  }
}

// pull -> generate
