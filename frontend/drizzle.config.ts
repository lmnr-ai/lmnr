import { config } from 'dotenv';
import { defineConfig, type Config } from 'drizzle-kit';
import { getDatabaseConfig } from './lib/db/drizzle';

config({ path: '.env.local' });

const dbConfig = getDatabaseConfig();
const dbCredentials: Record<string, string | number | Record<string, any>> = {
  user: dbConfig.username!,
  password: dbConfig.password,
  host: dbConfig.host!,
  port: dbConfig.port,
  database: dbConfig.database,
};

if (process.env.DATABASE_SSL_ROOT_CERT) {
  dbCredentials.ssl = {
    ca: process.env.DATABASE_SSL_ROOT_CERT,
  };
}


export default defineConfig({
  dialect: "postgresql",
  dbCredentials,
  schema: "./lib/db/migrations/schema.ts",
  out: "./lib/db/migrations",
  entities: {
    roles: {
      provider: "supabase",
    },
  },
} as Config);
