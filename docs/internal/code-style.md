# Code style and design rules

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

Cross-cutting rules for every change, in any language.

## Reuse before you add

- Grep the existing cache keys before adding one. If an entry already holds the fact, read it instead of adding a second entry to keep in sync.
- Grep for an existing function before adding one. Two functions with near-identical bodies are a design smell — pick the layer that owns the logic.
- Keep new items as private as they can be (`fn`, `pub(super)`, `pub(crate)`) until a caller outside the module exists.
- No wrapper whose whole body is a type conversion the caller could write — change the one signature instead.
- Prefer a primitive already used in the tree over introducing another dependency or abstraction.

## Layering and tenant scoping

- `app-server/src/db/` is SQL and row mapping only — no caching, no business rules. Carry `&DB` through services and take `.pool` at the `crate::db::` boundary.
- DB access and cache keys are always scoped: filter on / key by the project id when the data has one, the workspace id otherwise. A cache key missing the scope re-opens what the `WHERE` clause closed, since a hit skips the query.
- Logic another surface may need (CLI, public API, agent) belongs behind an app-server route, not in a Next.js server action.

## Rust

- Return a named struct, not a tuple — especially when members share a type (`ModelProvider` in `llm/mod.rs`). A swapped tuple compiles.
- No inline closures standing in for helper functions; extract a named function with a verb name.
- Transient failures (DB, cache, network) get retryable error variants; non-retryable ones are for genuine misconfiguration. On a worker path, the wrong choice turns a blip into a permanently failed run.

## Frontend schemas

- Derive per-action schemas with `.pick()` / `.omit()` / `.partial()` instead of reusing the full resource schema, and keep whatever gates the action in the UI reading the same required fields.
