import { config } from "dotenv";
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from "process";

import * as relations from './migrations/relations';
import * as schema from './migrations/schema';

config({ path: ".env" }); // or .env.local

interface DatabaseConfig {
  username: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

// Parse DATABASE_URL into connection parameters
const parseDatabaseUrl = (url: string): DatabaseConfig => {
  const regex = /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:]+):(\d*)\/(.+)$/;
  const match = url.match(regex);

  if (!match) {
    throw new Error('Invalid database URL');
  }

  const username = match[1] || 'postgres';
  const password = match[2];
  const host = match[3];
  const port = match[4] ? parseInt(match[4]) : 5432;
  const database = match[5] || username;

  if (!password) {
    throw new Error('Invalid database URL. Cannot find password');
  }
  if (!host) {
    throw new Error('Invalid database URL. Cannot find host');
  }

  return {
    username,
    password,
    host,
    port,
    database
  };
};

// Get connection parameters from individual environment variables
const getDatabaseConfigFromEnv = (): DatabaseConfig => {
  const username = env.DATABASE_USERNAME || 'postgres';
  const password = env.DATABASE_PASSWORD;
  const host = env.DATABASE_HOST;
  const port = env.DATABASE_PORT ? parseInt(env.DATABASE_PORT) : 5432;
  const database = env.DATABASE_DATABASE || username;

  return {
    username,
    password: password || '',
    host: host || '',
    port,
    database
  };
};

// Get database configuration from either DATABASE_URL or individual env vars
export const getDatabaseConfig = (): DatabaseConfig => {
  if (env.DATABASE_URL) {
    return parseDatabaseUrl(env.DATABASE_URL);
  } else {
    return getDatabaseConfigFromEnv();
  }
};

// Singleton function to ensure only one db instance is created
const singleton = <Value>(name: string, value: () => Value): Value => {
  const globalAny: any = global;
  globalAny.__singletons = globalAny.__singletons || {};

  if (!globalAny.__singletons[name]) {
    globalAny.__singletons[name] = value();
  }

  return globalAny.__singletons[name];
};

// Function to create the database connection and apply migrations if needed
const createDatabaseConnection = () => {
  const dbConfig = getDatabaseConfig();
  let connectOptions: postgres.Options<Record<string, any>> = {
    username: dbConfig.username,
    password: dbConfig.password,
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    max: Number(env.DATABASE_MAX_CONNECTION || 8),
  };
  if (env.DATABASE_SSL_ROOT_CERT) {
    connectOptions = {
      ...connectOptions,
      ssl: {
        mode: "verify-full",
        ca: env.DATABASE_SSL_ROOT_CERT,
      },
    };
  }
  const client = postgres(connectOptions);
  return drizzle(client, { schema: { ...schema, ...relations } });
};

const db = singleton('db', createDatabaseConnection);

export { db };
