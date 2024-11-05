import { config } from "dotenv";
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './migrations/schema';
import * as relations from './migrations/relations';

config({ path: ".env" }); // or .env.local

const client = postgres(process.env.DATABASE_URL!, { max: 10 });
export const db = drizzle(client, { schema: { ...schema, ...relations } });
