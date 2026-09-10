import { createClient } from "@clickhouse/client";
import { config } from "dotenv";

config({ path: ".env" }); // or .env.local

/**
 * Mirrors `SQL_QUERY_MAX_LIMIT_FOR_LAZY_MATERIALIZATION` in the app-server, which
 * documents the value. Both settings are only needed because cloud production pins
 * `compatibility = 24.6`, reverting them to off / `LIMIT <= 10`. `0` skips them,
 * required before ClickHouse 25.4 — including for the migrations sharing this client.
 */
const lazyMaterializationLimit = Number(process.env.SQL_QUERY_MAX_LIMIT_FOR_LAZY_MATERIALIZATION ?? 10000);
const lazyMaterializationSettings =
  Number.isFinite(lazyMaterializationLimit) && lazyMaterializationLimit > 0
    ? {
        query_plan_optimize_lazy_materialization: 1,
        query_plan_max_limit_for_lazy_materialization: lazyMaterializationLimit,
      }
    : {};

// https://clickhouse.com/docs/en/cloud/bestpractices/asynchronous-inserts -> Create client which will wait for async inserts
// For now, we're not waiting for inserts to finish, but later need to add queue and batch on client-side
export const clickhouseClient = createClient({
  url: process.env.CLICKHOUSE_URL,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD ?? "",
  database: "default",
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 0,
    ...lazyMaterializationSettings,
  },
});
