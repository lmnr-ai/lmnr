# Rust best practices (app-server)

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

Cross-cutting rules for app-server changes. The frontend equivalents live in `docs/internal/frontend-best-practices.md`.

## Reuse before you add

- Grep the existing cache keys before adding one. If an entry already holds the fact, read it instead of adding a second entry to keep in sync.
- Grep for an existing function before adding one. Two functions with near-identical bodies are a design smell — pick the layer that owns the logic.
- Keep new items as private as they can be (`fn`, `pub(super)`, `pub(crate)`) until a caller outside the module exists.
- No wrapper whose whole body is a type conversion the caller could write — change the one signature instead.
- Prefer a primitive already used in the tree over introducing another dependency or abstraction.

## Layering and tenant scoping

- `app-server/src/db/` is SQL and row mapping only — no caching, no business rules. Carry `&DB` through services and take `.pool` at the `crate::db::` boundary.
- DB access and cache keys are always scoped: filter on / key by the project id when the data has one, the workspace id otherwise. A cache key missing the scope re-opens what the `WHERE` clause closed, since a hit skips the query.

## Control flow

- A fixed, compile-time-known set of candidates is not a loop. Write the fallback order as explicit steps — an `if let … else if let …` chain, a `match`, or `.or_else` — each naming what it binds, instead of building an iterator over the candidates and driving a `let mut x = None` accumulator with a labeled `break`. Repeating a call four times is clearer than a 2×2 loop that hides which lookup won.
- Prefer immutable bindings produced by an expression over a mutable variable assigned from inside a loop or branch. If you need `let mut` plus a later `let Some(x) = x else`, restructure.
- When the candidates are rows of one table, fetch them together (`feature_id = ANY($2)`, or `ORDER BY <specificity> LIMIT 1` when only the winner matters) and pick in Rust, rather than one query per candidate that each miss the cache and the database. Group the fetch by cache scope so shared entries stay shared (`llm/profiles/store.rs::scope_route` loads a scope's `feature` and `default` rows in one query and caches both).

## Types and errors

- Return a named struct, not a tuple — especially when members share a type (`ModelProvider` in `llm/mod.rs`). A swapped tuple compiles.
- No inline closures standing in for helper functions; extract a named function with a verb name.
- Transient failures (DB, cache, network) get retryable error variants; non-retryable ones are for genuine misconfiguration. On a worker path, the wrong choice turns a blip into a permanently failed run.
