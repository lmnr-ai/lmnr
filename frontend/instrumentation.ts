// Yes, this file is called instrumentation.ts, but it's not actually used to instrument the app.
// Apparently, this is the suggested way to run startup hooks in Next.js:
// https://github.com/vercel/next.js/discussions/15341#discussioncomment-7091594

export async function register() {
  // prevent this from running in the edge runtime for the second time
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { Feature, isFeatureEnabled } = await import('lib/features/features');
    if (isFeatureEnabled(Feature.LOCAL_DB)) {
      const { migrate } = await import('drizzle-orm/postgres-js/migrator');
      const { llmPrices, pipelineTemplates, subscriptionTiers } = await import('lib/db/migrations/schema');
      const { db } = await import('lib/db/drizzle');

      const seed = async () => {
        // This is a silly check to see if the table is already populated
        // because drizzle-kit doesn't support seeding yet
        // https://orm.drizzle.team/docs/kit-seed-data
        const tiersData = await db.select().from(subscriptionTiers);
        if (tiersData.length > 0) {
          return;
        }

        const seedData = require('lib/db/seed.json');
        for (const entry of seedData) {
          const tableName: string = entry.table;
          const tables: Record<string, any> = {
            'subscription_tiers': subscriptionTiers,
            'pipeline_templates': pipelineTemplates,
            'llm_prices': llmPrices,
          };
          const table = tables[tableName];
          const rows: Record<string, unknown>[] = entry.data.map((row: Record<string, unknown>) =>
            Object.fromEntries(Object.entries(row).map(([k, v]) =>
              // camelCase the keys for drizzle
              [k.replace(/(_[a-z])/g, m => m[1].toUpperCase()), v]))
          );

          await db.insert(table).values(rows);
        }
      };

      await migrate(db, { migrationsFolder: 'lib/db/migrations' });
      await seed();
      console.log('Seeded database with data from seed.json');
    } else {
      console.log('Local DB is not enabled, skipping migrations and seeding');
    }
  }
}
