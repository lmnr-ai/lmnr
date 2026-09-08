# Code style and design rules

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

Cross-cutting rules that apply to every change, in any language. Each is something that has been sent back in review on code that already worked.

## Reuse before you add

- **Grep before adding a cache key or a `pub fn`.** A project's workspace id already comes from `utils::limits::get_workspace_info_for_project_id` (backed by the `project:{id}` entry) — a second key for the same fact is a second thing to invalidate. Two public functions with near-identical bodies are a design smell, not a convenience: pick the layer that owns the logic. Keep new items private (`fn`, `pub(super)`, `pub(crate)`) until a caller outside the module exists.
- **Never call a batch helper with a one-element slice.** `get_x_names(pool, &[id])` then `names.remove(&id)` is a single-row query written the long way; add the single-row function next to the batch one (`db/llm_profiles.rs` has both). Prefer `.get()` over `mut` + `.remove()` unless you are consuming the collection.
- **No wrapper whose whole body is a type conversion the caller could write** (a `decrypt(id: Uuid, …)` that only calls `decrypt(&id.to_string(), …)`). Change the one signature instead.
- **Prefer a primitive already used in the tree** — an in-process map keyed by id is a `DashMap`; reach for a TTL/eviction cache only when you can name the eviction requirement.

## Layering and tenant scoping

- **`app-server/src/db/` is SQL and row mapping only** — no `crate::cache`, no business rules. The cached accessor lives in the module that owns the concept and calls down into `db::` on a miss. Carry `&DB` through services and take `.pool` at the `crate::db::` boundary.
- **Every db function on a tenant-owned row filters on the owning scope** — `WHERE id = $1 AND workspace_id = $2`, never id-only with the check left to the caller. Tenant-scoped cache keys carry the tenant too (`llm_profile:{workspace_id}:{profile_id}`), since a cache hit skips the `WHERE` clause entirely.
- **Logic another surface will need belongs behind an app-server route, not in a Next.js server action.** If the CLI, public API, agent or Terraform can plausibly reach the resource, the server action is a thin call into the app-server. Server actions are for UI-only plumbing.

## Rust

- **Return a named struct, not a tuple** — especially when members share a type. `-> (String, String)` makes the call site depend on remembering the order, and a swap compiles; `ModelProvider` (`llm/mod.rs`) destructures in one line and the compiler catches the mistake.
- **No inline closures standing in for helper functions.** A `let api_key = || { … };` defined at the top and called further down is a TypeScript IIFE habit — extract a named function with a verb name, or inline the body.
- **Don't change an existing signature as a side effect of a feature** (flipping a returned tuple, `String` → `&str` plus a new lifetime, widening a param "while we're here"). It spends reviewer attention the feature needed.
- **Map transient failures to retryable error variants.** On any path a worker retries, a Postgres/cache/network failure tagged as a config error is fatal: `ProviderError::is_retryable()` decides redeliver vs. write-failed-and-ack, so a DB blip permanently kills in-flight runs. Non-retryable variants are for genuine misconfiguration.

## Frontend schemas

- **A validation bound must trace to a column width, a shared constant or a stated product rule.** A `.max(256)` invented at the schema is a magic number that will be copied around and eventually contradict the column it guards.
- **Derive per-action schemas with `.pick()` / `.omit()` / `.partial()` instead of reusing the full resource schema.** A "test connection" probe validated against the create schema rejects an unnamed draft over a field it never sends — and whatever gates the action in the UI must read the same required fields as the schema the server validates against.
