import { AsyncLocalStorage } from "node:async_hooks";

import { db } from "@/lib/db/drizzle";

export type AuthTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const currentTransaction = new AsyncLocalStorage<AuthTransaction>();

// Better Auth's transaction adapter only reaches models in its own schema, so plugin
// callbacks that write app tables (SCIM projection) need the raw Drizzle transaction it
// opened: a second connection would block on the plugin's uncommitted user rows.
export const authDb: typeof db = Object.assign(Object.create(db) as typeof db, {
  transaction: ((callback, config) =>
    db.transaction((tx) => currentTransaction.run(tx, () => callback(tx)), config)) as typeof db.transaction,
});

export const getAuthTransaction = (): AuthTransaction => {
  const tx = currentTransaction.getStore();
  if (!tx) throw new Error("No Better Auth database transaction is active");
  return tx;
};
