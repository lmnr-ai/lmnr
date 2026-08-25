# Postgres: migrations, schema config, collation

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

## Database Migrations

Database schema is managed with Drizzle ORM. The source of truth is the database itself - do NOT edit schema files directly.

```bash
cd frontend
pnpm db:generate                # Generate migrations AND strip "public". qualifiers (preferred)
# or, equivalently:
npx drizzle-kit generate && pnpm db:strip-schema
# Migrations are applied automatically on frontend startup
```

- `pnpm schema-pull:lint` heavily reformats `schema.ts`, `relations.ts`, and `tsconfig.json`. After running it, revert unrelated formatting changes before committing.
- **Migration SQL must stay schema-neutral (no `"public".` qualifiers).** Tables resolve via the connection `search_path` (`POSTGRES_SCHEMA`, default `public`), so a hardcoded `"public".` would break non-public self-hosted installs. `drizzle-kit generate` re-emits `"public".` prefixes (it has no schema-neutral output mode) on tables, **foreign-key targets**, **enum/type creation**, and **column type changes**. `pnpm db:generate` runs the generate then `pnpm db:strip-schema`, which `sed`s every `"public".` token out of all migration `.sql` files. If you generate by hand, run `pnpm db:strip-schema` (or `sed -i 's/"public"\.//g' <file>`) afterwards. The strip targets only the `"public".` schema qualifier (double-quoted name + dot), so `'public'` string literals, `public_`-prefixed constraint names, and `public_key` columns are left intact. Snapshots/`_journal.json` already record an empty schema.
- `npx drizzle-kit generate` requires a TTY only for its name prompt — pass `--name <slug>` and it runs fine in non-interactive shells (CI, sandbox). It diffs `schema.ts` against the latest snapshot, so apply the DDL to the staging DB and add the table to `schema.ts` first; expect stray index churn in the generated SQL when the DB has drifted from the snapshots — strip unrelated statements before committing.
- When writing migrations manually, also create a `meta/NNNN_snapshot.json`. Copy the previous snapshot, apply the schema change (e.g. add/remove columns), set `prevId` to the previous snapshot's `id`, and generate a new UUID for `id`. Without a snapshot, the next `drizzle-kit generate` will produce a duplicate migration.
- **ClickHouse migrations** (`frontend/lib/clickhouse/migrations/`) are tracked by the migration tool and only run once. Never modify an already-applied migration file — changes won't execute on existing deployments and may cause checksum errors. Always create a new numbered migration file instead.

## How migration failures surface (and the pre-release check)

Migrations run from the frontend's `instrumentation.ts` `register()` hook on boot, gated on `Feature.LOCAL_DB` (`ENVIRONMENT !== "PRODUCTION"` or `FORCE_RUN_MIGRATIONS=true`). Any failure takes the process down with exit code 1, but by two different routes:

- **Postgres** — `migrate()` throws out of `register()`; Next.js prints `An error occurred while loading instrumentation hook: …` and exits 1. drizzle wraps all pending migrations in a single transaction, so a mid-run failure rolls the whole batch back and the `__drizzle_migrations` tracker is left untouched.
- **ClickHouse** — `clickhouse-migrations`' `migration()` calls `process.exit(1)` internally instead of throwing, so it **bypasses the `try/catch` in `initializeClickHouse`**: a ClickHouse failure never logs `Failed to apply ClickHouse migrations`, the process just dies. Its integrity guards (migration file changed or removed after apply, statement failure, `_migrations` table unreadable) all exit the same way.

On success `pnpm dev` keeps running, so anything automating a migration run must poll the log for `✓ Postgres migrations applied successfully` and `✓ ClickHouse schema applied successfully` rather than waiting on an exit code. `.github/workflows/migrations-integrity-check.yml` (manual dispatch) does exactly that, applying the dispatched ref's migrations both to empty databases and on top of `main`, and is the gate to run before merging `dev` into `main` and cutting a release.

**Env precedence gotcha:** an already-exported `DATABASE_URL` / `CLICKHOUSE_URL` wins over `frontend/.env.local` — Next.js and `dotenv` (`config()` in `lib/db/drizzle.ts`) both skip vars already present in `process.env`. A shell that exports these silently points migrations at a different database than the `.env.local` you just edited, with no warning in the log.

## Configurable Postgres schema (`POSTGRES_SCHEMA`)

- `POSTGRES_SCHEMA` (default `public`) is the schema all Postgres tables live in. It's applied as the connection `search_path` in BOTH services — frontend `lib/db/drizzle.ts` (`connection: { search_path }` on the `postgres()` client) and app-server `db/mod.rs` (`PgConnectOptions::options([("search_path", …)])`, descriptor `env::database::SCHEMA`). All queries use unqualified table names, so the search_path is the only routing mechanism; the two services MUST be set to the same value.
- The frontend resolves the value via `getPostgresSchema()` in `drizzle.ts`: empty/unset means "no explicit schema" (connection defaults to `public`). For the connection `search_path`, any explicit value — INCLUDING `public` — is applied. For the migrations-tracker location (`migrationsSchema`) and the boot-time `CREATE SCHEMA`, any case variant of `public` is treated like unset (the check is `postgresSchema.toLowerCase() === "public"`).
- **`migrationsSchema` guard (instrumentation.ts):** `migrate()` is passed `migrationsSchema: <schema>` ONLY when an explicit `POSTGRES_SCHEMA` is set AND it is not a case-insensitive `public`. Relocating `__drizzle_migrations` into a schema where it doesn't already exist makes the migrator see "no last migration" and re-run all migrations (non-idempotent `ALTER TYPE … ADD VALUE` / `DROP CONSTRAINT` then errors). So: unset or `public` (any case) → tracker stays in `drizzle` (where existing default deployments have it, so an operator who sets `POSTGRES_SCHEMA=public` "to be explicit" doesn't trip a re-run); any other explicit schema → tracker moves into that schema (lets a Laminar DB coexist with another Drizzle service in the same instance).
- `POSTGRES_CREATE_SCHEMA` (default `true`, frontend-only) gates the boot-time `CREATE SCHEMA IF NOT EXISTS`. Set `false` when the schema is pre-provisioned or the DB role lacks `CREATE`. The data schema is NOT auto-created by the migrator — only the migrations-table schema is — so this DDL is required for a fresh non-public install. The `CREATE SCHEMA` is skipped for any case variant of `public` (it always exists, and quoting `"PUBLIC"` into the DDL would create a distinct schema that the lowercase-folding `search_path` never resolves to).

## Alphabetical sorting in Postgres (collation)

- **`ORDER BY <name>` is collation-dependent and is NOT case-insensitive in general.** Staging (Supabase) is `en_US.UTF-8`, where the ICU-ish ordering already folds case, so a case bug there is invisible; a `C`/`POSIX`-collation instance sorts by raw bytes, putting EVERY capital ahead of EVERY lowercase (`Zebra` before `apple`). Do not verify a name-ordering change against staging alone.
- Sort user-facing names with `ascNameFold(column)` (`frontend/lib/db/utils.ts`), which emits `ORDER BY lower(col), col` — the `lower()` folds case, the raw column is the deterministic tiebreak for names differing only in case. Use it for every project/workspace picker; in raw SQL (app-server) write `ORDER BY lower(p.name), p.name` by hand. Note `lower()` makes the sort non-sargable, so an index on the bare column no longer serves it — fine for these small per-workspace lists, but add a `lower(col)` expression index if a large table ever needs this ordering.
