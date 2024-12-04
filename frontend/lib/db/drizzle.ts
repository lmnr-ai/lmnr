import { config } from "dotenv";
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as relations from './migrations/relations';
import * as schema from './migrations/schema';

config({ path: ".env" }); // or .env.local

// Singleton function to ensure only one db instance is created
function singleton<Value>(name: string, value: () => Value): Value {
  const globalAny: any = global;
  globalAny.__singletons = globalAny.__singletons || {};

  if (!globalAny.__singletons[name]) {
    globalAny.__singletons[name] = value();
  }

  return globalAny.__singletons[name];
}

// Function to create the database connection and apply migrations if needed
function createDatabaseConnection() {
  const client = postgres(process.env.DATABASE_URL!, { max: 10 });

  return drizzle(client, { schema: { ...schema, ...relations } });
}

const db = singleton('db', createDatabaseConnection);

export { db };
