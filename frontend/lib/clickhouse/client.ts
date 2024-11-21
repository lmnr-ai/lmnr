import { config } from "dotenv";
import { createClient } from "@clickhouse/client";

config({ path: ".env" }); // or .env.local

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
  },
});
