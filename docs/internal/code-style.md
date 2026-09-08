# Code style and design rules

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

Cross-cutting rules that apply to every change, in any language. Each one is distilled from repeated review feedback on code that *worked* — these are the things that get a PR sent back, and every one of them is cheap up front and expensive once the diff is under review.

## Reuse before you add

- **Before adding a cache key, grep `cache/keys.rs` for an entry that already holds the fact.** A project's workspace id comes from `utils::limits::get_workspace_info_for_project_id` (backed by the `project:{id}` entry billing and limits already keep warm) — do not add a second `project_workspace:{id}` key for it. A duplicate entry is a second thing to invalidate and a second way to serve a stale answer.
- **Before adding a `pub fn`, grep for one that already does the job.** Two public functions with near-identical bodies — typically a free function plus a method that wraps it — are a design smell, not a convenience: decide which layer owns the logic and point the other callers at it. Keep new items as private as they can be (`fn`, `pub(super)`, `pub(crate)`); make them `pub` when a caller outside the module actually exists.
- **Never call a batch helper with a one-element slice.** `get_x_names(pool, &[id])` followed by `names.remove(&id)` is a single-row query written the long way (and it forces a `mut` binding to read one value). Add the single-row function next to the batch one — `db/llm_profiles.rs` carries both `get_llm_profile_name` and `get_llm_profile_names` for exactly this reason. More generally, prefer `.get()` over `mut` + `.remove()` unless you are genuinely consuming the collection.
- **Don't add a wrapper whose whole body is a type conversion the caller could write.** `decrypt(workspace_id: Uuid, …)` delegating to `decrypt_with_aad(&workspace_id.to_string(), …)` is not an API, it's an alias: change the one signature to take `&str` (`data_plane/crypto.rs`) and let callers pass `&id.to_string()`.
- **Prefer the primitive already in the tree.** An in-process map keyed by id is a `DashMap` (`llm/profiles/store.rs`, `realtime/mod.rs`, `mq/tokio_mpsc.rs`); `moka` belongs to `cache/in_memory.rs` and nowhere else. Reach for a TTL/eviction cache only when you can name the eviction requirement — otherwise you have added a dependency and a tuning knob in place of a hash map.

## Layering

- **`app-server/src/db/` is SQL and row mapping, nothing else.** No `crate::cache` imports, no read-through caching, no business rules. The cached accessor belongs to the module that owns the concept and calls down into `db::` for the miss (`llm/profiles/store.rs::get_profile_cached` → `db::llm_profiles::get_llm_profile`).
- **Carry `&DB` / `Arc<DB>` through service and store layers; reach for `.pool` only at the `crate::db::` call boundary.** A `PgPool` threaded through the middle of a service makes the layer look like a db module and blocks it from ever using the other handles on `DB`.
- **Logic that more than one surface needs belongs in the app-server, not in a Next.js server action.** If a resource is (or plausibly will be) reachable from the UI *and* the CLI, public API, agent or Terraform, its validation, secret handling and cache invalidation live behind an app-server route and the server action is a thin call to it. Server actions are for UI-only plumbing.

## Tenant scoping

- **Every db function that reads or writes a tenant-owned row takes the owning scope and filters on it** — `WHERE id = $1 AND workspace_id = $2`, never `WHERE id = $1` with the check left to the caller. An id-only lookup is one forgetful caller away from cross-tenant reads, and reviewers cannot tell the safe callers from the unsafe ones by looking at the query.
- **Tenant-scoped cache keys carry the tenant** — `llm_profile:{workspace_id}:{profile_id}`, not `llm_profile:{profile_id}`. An id-only key re-opens the hole the `WHERE` clause closed, since a cache hit skips the query entirely. When one service writes a key and another reads it, both sides change in the same PR.

## Rust

- **Return a named struct, not a tuple — especially when members share a type.** `-> (String, String)` makes the call site depend on remembering whether model or provider comes first, and a swap compiles. `ModelProvider` (`llm/mod.rs`) is the shape to copy: `let ModelProvider { model, provider } = …` destructures in one line and the compiler catches the mistake. Short tuples of clearly different types inside a private helper are fine.
- **No inline closures standing in for helper functions.** A `let api_key = || { … };` defined at the top of a function and called further down is a TypeScript IIFE habit; extract a named function with a verb name (`init_api_key`) or inline the body. Closures are for captures, iterator adapters and callbacks.
- **Don't change an existing signature as a side effect of a feature.** Flipping the order of a returned tuple, switching a returned `String` to `&str` plus a fresh lifetime parameter, or widening a parameter "while we're here" all spend reviewer attention that the feature needed. If the change is required, say so in the PR description; if it isn't, leave it for a follow-up.
- **Map transient failures to retryable error variants.** On any path a worker retries, Postgres / cache / network failures must not surface as config-style errors: `ProviderError::is_retryable()` decides whether the queue redelivers or the run is written as failed and acked, so a DB blip tagged `ConfigError` permanently kills in-flight jobs instead of delaying them. Reserve non-retryable variants for genuine misconfiguration ("model not listed on this profile", "unknown provider").

## Validation and schemas (frontend)

- **A validation bound must trace to something** — a DB column width, an existing shared constant, or a stated product rule. A bare `.max(256)` invented at the schema is a magic number that will be copied around and eventually contradict the column it guards. Point it at the constraint or leave it off.
- **Derive per-action schemas from the resource schema (`.pick()` / `.omit()` / `.partial()`) rather than reusing the full one.** A "test connection" probe validated against the create schema rejects an unnamed draft over a `name` the probe never sends. Whatever gates the action in the UI (a `canTest`-style predicate) must read the same required fields as the schema the server will validate against — the two drifting apart is the bug.

## Naming and comments

- **Name the external source of a borrowed constant.** Provider keys that mirror litellm's price map, header names copied from a vendor's docs, strings that must equal a frontend constant — one line saying where the name came from, or the next reader cannot tell a deliberate odd name from a typo and won't know what breaks if they rename it.

## Alternative config paths

- **A newly added configuration path must not be gated behind the old one succeeding.** When a feature gains a second source of credentials or config next to an env-based one, walk the matrix explicitly: old absent, old present and complete, old present but *incomplete*, both present. The failure mode that ships otherwise is "a stale env var silently disables the feature this PR adds".
