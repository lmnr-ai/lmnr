// Post-pull codemod: force `mode: 'date'` on timestamp columns of BetterAuth-owned
// tables. `drizzle-kit pull` always emits timestamptz as `mode: 'string'`, but the
// BetterAuth drizzle adapter inserts raw JS `Date` objects — drizzle then calls
// `.toISOString()` on a Date and throws ERR_INVALID_ARG_TYPE under `mode: 'string'`.
// There is no adapter-side knob for this, so we re-apply the modes on every pull
// instead of hand-editing schema.ts. Run from `schema-pull:lint` after the sed steps.
//
// Scoped to the auth tables only — a global flip would break the ~50 other tables
// whose app code reads timestamps as strings. `users` is included because BetterAuth
// also writes users.created_at/updated_at; no app code reads those two as strings
// (workspace-users.tsx reads membersOfWorkspaces.createdAt, not users.createdAt).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../lib/db/migrations/schema.ts");

// Drizzle export const names of the BetterAuth-managed tables.
const AUTH_TABLES = ["users", "sessions", "accounts", "verifications", "jwks", "deviceCodes"];

const source = readFileSync(SCHEMA_PATH, "utf8");

// Split on table declarations so a `mode: 'string'` is only rewritten when it falls
// inside one of the auth-table blocks (a per-line sed can't tell which table owns a line).
const blocks = source.split(/(?=^export const \w+ = pgTable\()/m);

let changed = 0;
const out = blocks
  .map((block) => {
    const match = block.match(/^export const (\w+) = pgTable\(/);
    if (!match || !AUTH_TABLES.includes(match[1])) return block;
    return block.replace(/(\btimestamp\([^)]*mode: )'string'/g, (full, prefix) => {
      changed += 1;
      return `${prefix}'date'`;
    });
  })
  .join("");

if (changed > 0) {
  writeFileSync(SCHEMA_PATH, out);
}
console.log(`[fix-auth-timestamp-modes] set mode:'date' on ${changed} BetterAuth timestamp column(s)`);
