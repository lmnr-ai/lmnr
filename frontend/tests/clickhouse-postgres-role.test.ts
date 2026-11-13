import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import type { ClickHouseClient } from "@clickhouse/client";

import { ensureClickhousePostgresDatabase, ensurePostgresReadonlyRole } from "@/lib/clickhouse/postgres-engine";
import { db } from "@/lib/db/drizzle";

const envKeys = [
  "DATABASE_URL",
  "CLICKHOUSE_POSTGRES_USER",
  "CLICKHOUSE_POSTGRES_PASSWORD",
  "CLICKHOUSE_POSTGRES_HOST",
  "CLICKHOUSE_POSTGRES_PORT",
  "CLICKHOUSE_POSTGRES_DATABASE",
  "CLICKHOUSE_POSTGRES_SCHEMA",
  "CLICKHOUSE_POSTGRES_STATEMENT_TIMEOUT",
  "CLICKHOUSE_POSTGRES_CONNECTION_LIMIT",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of envKeys) {
    delete process.env[key];
  }
  process.env.DATABASE_URL = "postgres://migration:unused@localhost:5432/laminar";
  process.env.CLICKHOUSE_POSTGRES_USER = "external_reader";
  process.env.CLICKHOUSE_POSTGRES_PASSWORD = "test-only-password";
  mock.method(console, "log", () => {});
  mock.method(console, "warn", () => {});
});

afterEach(() => {
  mock.restoreAll();
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

const TURN_OFF_STATEMENTS = [
  "DROP DICTIONARY IF EXISTS signals_dict SYNC",
  "DROP DICTIONARY IF EXISTS evaluations_dict SYNC",
  "DROP DICTIONARY IF EXISTS datasets_dict SYNC",
  "DROP DATABASE IF EXISTS pg SYNC",
];

function clickhouseMock() {
  const command = mock.fn(async (_request: { query: string }) => ({}));
  return { client: { command } as unknown as ClickHouseClient, command };
}

test("existing roles retain their password, settings, and CONNECT grant while receiving application grants", async () => {
  const execute = mock.method(db, "execute", async () => [{ privileged: false }]);
  await ensurePostgresReadonlyRole();
  const statements = execute.mock.calls.map((call) => call.arguments[0]).filter((query) => typeof query === "string");
  assert.ok(statements.length > 0);
  assert.ok(statements.every((query) => !/CREATE ROLE|ALTER ROLE|GRANT CONNECT/.test(query)));
  assert.ok(statements.some((query) => query.includes("GRANT USAGE ON SCHEMA")));
  assert.ok(statements.some((query) => query.includes("GRANT SELECT (")));
  assert.ok(statements.some((query) => query.includes("CREATE POLICY clickhouse_ro_select")));
});

test("missing roles still receive login provisioning, settings, CONNECT, and application grants", async () => {
  const execute = mock.method(db, "execute", async () => []);
  await ensurePostgresReadonlyRole();
  const statements = execute.mock.calls.map((call) => call.arguments[0]).filter((query) => typeof query === "string");
  assert.ok(statements.some((query) => query.includes('CREATE ROLE "external_reader" LOGIN')));
  assert.ok(statements.some((query) => query.includes('ALTER ROLE "external_reader" LOGIN PASSWORD')));
  assert.ok(statements.some((query) => query.includes("CONNECTION LIMIT 16")));
  assert.ok(statements.some((query) => query.includes("statement_timeout = '15s'")));
  assert.ok(statements.some((query) => query.includes('GRANT CONNECT ON DATABASE "laminar"')));
  assert.ok(statements.some((query) => query.includes("CREATE POLICY clickhouse_ro_select")));
});

test("external role still configures the ClickHouse connection with the supplied credentials", async () => {
  process.env.CLICKHOUSE_POSTGRES_HOST = "pgbouncer.internal";
  process.env.CLICKHOUSE_POSTGRES_SCHEMA = "laminar";
  const execute = mock.method(db, "execute", async () => [{ privileged: false }]);
  const { client, command } = clickhouseMock();

  await ensureClickhousePostgresDatabase(client);

  assert.equal(execute.mock.callCount(), 1); // Read-only dedicated-role check.
  const statements = command.mock.calls.map((call) => call.arguments[0].query);
  assert.equal(statements[0], "DROP DATABASE IF EXISTS pg SYNC");
  assert.match(statements[1], /CREATE DATABASE pg\s+ENGINE = PostgreSQL/);
  assert.ok(statements[1].includes("'pgbouncer.internal:5432'"));
  assert.ok(statements[1].includes("'external_reader'"));
  assert.ok(statements[1].includes("'test-only-password'"));

  // A dict over a `pg` table would make ClickHouse connect to Postgres at startup.
  const dicts = statements.slice(2);
  assert.equal(dicts.length, 3);
  for (const dict of dicts) {
    assert.match(dict, /CREATE OR REPLACE DICTIONARY \w+_dict/);
    assert.ok(dict.includes("SOURCE(POSTGRESQL("));
    assert.ok(dict.includes("HOST 'pgbouncer.internal'"));
    assert.ok(dict.includes("SCHEMA 'laminar'"));
    assert.ok(dict.includes("USER 'external_reader'"));
    assert.ok(dict.includes("MAX_THREADS_FOR_UPDATES 2"));
    assert.ok(!dict.includes("DB 'pg'"));
  }
});

test("existing roles do not bypass rejection of privileged Postgres roles", async () => {
  mock.method(db, "execute", async () => [{ privileged: true }]);
  const { client, command } = clickhouseMock();

  await ensureClickhousePostgresDatabase(client);

  assert.deepEqual(
    command.mock.calls.map((call) => call.arguments[0].query),
    TURN_OFF_STATEMENTS
  );
});

test("existing roles do not permit the application's own Postgres login", async () => {
  process.env.CLICKHOUSE_POSTGRES_USER = "migration";
  mock.method(db, "execute", async () => [{ privileged: false }]);
  const { client, command } = clickhouseMock();

  await ensureClickhousePostgresDatabase(client);

  assert.deepEqual(
    command.mock.calls.map((call) => call.arguments[0].query),
    TURN_OFF_STATEMENTS
  );
});

test("a failed role check preserves the existing ClickHouse connection", async () => {
  mock.method(db, "execute", async () => {
    throw new Error("Postgres unavailable");
  });
  const { client, command } = clickhouseMock();

  await ensureClickhousePostgresDatabase(client);

  assert.equal(command.mock.callCount(), 0);
});

test("unset credentials still disable the ClickHouse connection", async () => {
  delete process.env.CLICKHOUSE_POSTGRES_USER;
  delete process.env.CLICKHOUSE_POSTGRES_PASSWORD;
  const execute = mock.method(db, "execute", async () => {
    throw new Error("No Postgres access expected");
  });
  const { client, command } = clickhouseMock();

  await ensurePostgresReadonlyRole();
  await ensureClickhousePostgresDatabase(client);

  assert.equal(execute.mock.callCount(), 0);
  assert.deepEqual(
    command.mock.calls.map((call) => call.arguments[0].query),
    TURN_OFF_STATEMENTS
  );
});

test("a failed role lookup cannot provision or grant privileges", async () => {
  const execute = mock.method(db, "execute", async () => {
    throw new Error("Postgres unavailable");
  });
  await ensurePostgresReadonlyRole();
  assert.equal(execute.mock.callCount(), 1);
});
