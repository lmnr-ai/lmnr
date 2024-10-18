import { config } from "dotenv";
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

config({ path: ".env" }); // or .env.local

const client = postgres(process.env.DATABASE_URL!, { max: 10 });
export const db = drizzle(client);
