import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import type { ClickHouseClient } from "@clickhouse/client";

import { ensureClickhousePostgresDatabase, ensurePostgresReadonlyRole } from "@/lib/clickhouse/postgres-engine";
import { db } from "@/lib/db/drizzle";

const envKeys = [
  "DATABASE_URL",
  "CLICKHOUSE_POSTGRES_MANAGE_ROLE",
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

function clickhouseMock() {
  const command = mock.fn(async (_request: { query: string }) => ({}));
  return { client: { command } as unknown as ClickHouseClient, command };
}

test("external management performs no Postgres role, password, grant, or policy operations", async () => {
  process.env.CLICKHOUSE_POSTGRES_MANAGE_ROLE = "false";
  const execute = mock.method(db, "execute", async () => {
    throw new Error("Role provisioning must not access Postgres");
  });

  await ensurePostgresReadonlyRole();

  assert.equal(execute.mock.callCount(), 0);
});

for (const manageRole of [undefined, "true"]) {
  test(`role provisioning remains enabled with MANAGE_ROLE=${manageRole ?? "unset"}`, async () => {
    if (manageRole !== undefined) {
      process.env.CLICKHOUSE_POSTGRES_MANAGE_ROLE = manageRole;
    }
    const execute = mock.method(db, "execute", async () => [{ privileged: false }]);

    await ensurePostgresReadonlyRole();

    const statements = execute.mock.calls.map((call) => call.arguments[0]).filter((query) => typeof query === "string");
    assert.ok(statements.some((query) => query.includes('CREATE ROLE "external_reader" LOGIN')));
    assert.ok(statements.some((query) => query.includes('ALTER ROLE "external_reader" LOGIN PASSWORD')));
    assert.ok(statements.some((query) => query.includes('GRANT CONNECT ON DATABASE "laminar"')));
    assert.ok(statements.some((query) => query.includes("CREATE POLICY clickhouse_ro_select")));
  });
}

test("external role still configures the ClickHouse connection with the supplied credentials", async () => {
  process.env.CLICKHOUSE_POSTGRES_MANAGE_ROLE = "false";
  process.env.CLICKHOUSE_POSTGRES_HOST = "pgbouncer.internal";
  process.env.CLICKHOUSE_POSTGRES_SCHEMA = "laminar";
  const execute = mock.method(db, "execute", async () => [{ privileged: false }]);
  const { client, command } = clickhouseMock();

  await ensurePostgresReadonlyRole();
  await ensureClickhousePostgresDatabase(client);

  assert.equal(execute.mock.callCount(), 1); // Read-only dedicated-role check.
  const statements = command.mock.calls.map((call) => call.arguments[0].query);
  assert.equal(statements[0], "DROP DATABASE IF EXISTS pg SYNC");
  assert.match(statements[1], /CREATE DATABASE pg\s+ENGINE = PostgreSQL/);
  assert.ok(statements[1].includes("'pgbouncer.internal:5432'"));
  assert.ok(statements[1].includes("'external_reader'"));
  assert.ok(statements[1].includes("'test-only-password'"));
});

test("external management does not bypass rejection of privileged Postgres roles", async () => {
  process.env.CLICKHOUSE_POSTGRES_MANAGE_ROLE = "false";
  mock.method(db, "execute", async () => [{ privileged: true }]);
  const { client, command } = clickhouseMock();

  await ensureClickhousePostgresDatabase(client);

  assert.deepEqual(
    command.mock.calls.map((call) => call.arguments[0].query),
    ["DROP DATABASE IF EXISTS pg SYNC"]
  );
});

test("external management does not permit the application's own Postgres login", async () => {
  process.env.CLICKHOUSE_POSTGRES_MANAGE_ROLE = "false";
  process.env.CLICKHOUSE_POSTGRES_USER = "migration";
  mock.method(db, "execute", async () => [{ privileged: false }]);
  const { client, command } = clickhouseMock();

  await ensureClickhousePostgresDatabase(client);

  assert.deepEqual(
    command.mock.calls.map((call) => call.arguments[0].query),
    ["DROP DATABASE IF EXISTS pg SYNC"]
  );
});

test("a failed role check preserves the existing ClickHouse connection", async () => {
  process.env.CLICKHOUSE_POSTGRES_MANAGE_ROLE = "false";
  mock.method(db, "execute", async () => {
    throw new Error("Postgres unavailable");
  });
  const { client, command } = clickhouseMock();

  await ensureClickhousePostgresDatabase(client);

  assert.equal(command.mock.callCount(), 0);
});

test("unset credentials still disable the ClickHouse connection with external role management", async () => {
  process.env.CLICKHOUSE_POSTGRES_MANAGE_ROLE = "false";
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
    ["DROP DATABASE IF EXISTS pg SYNC"]
  );
});
