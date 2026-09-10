# Keeping OSS and `lmnr-private` in sync

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

## The fork shape

- **`lmnr-ai/lmnr` (OSS) and `lmnr-ai/lmnr-private` share ~2200 tracked files that must stay byte-identical, and `lmnr-private` is the source of truth** (it's the production deployment). Features are normally built in OSS and reach private via a `git merge upstream/dev`; when a feature is built directly in private instead, its public files have to be back-ported by hand, and that's the step that gets forgotten.
- Only these may legitimately differ:
  - enterprise files that exist solely in private — `*/private/`, `app-server/src/agent/`, `api/v1/cli/agent.rs`, `traces/previews/`, `traces/sampling.rs`, and the frontend agent tree (`components/agent/private/`, `lib/agent/`, `lib/actions/agent-chat/`, the `api/…/agent/*` routes, `app/(auth)/(app)/project/[projectId]/home/page.tsx`);
  - `.github/` (private has its own deploy workflows and deletes OSS's `dependabot.yml` + build/test workflows — **keep those in OSS**), `.vscode/settings.json`, `README.md`, `CLAUDE.md`;
  - `app-server/Dockerfile` and `app-server/.cargo/config.toml` (private bakes ONNX Runtime + embedding weights for clustering);
  - `docs/internal/signals.md` (OSS ships a trimmed copy — the enterprise sections are private-only), plus the private-only notes `agent.md` / `clustering.md` / `release-ci.md`;
  - `frontend/components/agent/index.tsx` (OSS ships the stub barrel, private re-exports `./private`) and `frontend/public/.well-known/microsoft-identity-association.json`.
- **Everything else drifting is a missed back-port.**

## Auditing the drift

- A flat two-tree diff is useless here — it can't tell "private changed this" from "OSS changed this". Classify three ways against the **merge base** (`git merge-base` of the two `dev` tips, found via the `oss` remote in `lmnr-private`): changed-in-private-only (back-port), changed-in-OSS-only (already flows on the next upstream merge — leave it), changed-in-both (hand-merge, and usually only one or two are real conflicts).
- **`/repos/lmnr-private` is a shallow clone in this sandbox** (`.git/shallow` exists), so it cannot serve as a fetch *source*: adding it as a remote in `lmnr` and fetching dies with `did not send all necessary objects` / `revision walk setup failed`. Diff from inside `lmnr-private` using its existing `oss` remote, and move file contents with plain `cp` from its working tree.
- Verify a port mechanically rather than by eye: after committing, loop the commit's file list through `cmp -s "$f" "/repos/lmnr-private/$f"` and expect DIFFERS only for the files you deliberately hand-merged. This also catches drift injected by the frontend pre-commit hook (oxfmt/oxlint rewriting a file private didn't have rewritten).

## Back-porting

- **Back-porting a private PR is a mechanical `git apply`, not a re-implementation.** Fetch the PR branch in `lmnr-private`, then `git diff <base>..<pr-branch> --binary -- . ':(exclude)app-server/src/signals/private' ':(exclude)app-server/src/ch/private'` and `git apply` it in `lmnr` (add whichever other private-only trees the PR touched). It applies clean for every file that was byte-identical at the base — verify that first with a `diff -q <(git show <base>:$f) /repos/lmnr/$f` loop over the PR's file list, and afterwards re-run the same loop against the PR HEAD to prove the port is byte-identical.
- Only `main.rs` and `docs/internal/signals.md` normally need hand-merging. **The frontend fork boundary is tiny** — essentially every frontend file in a private PR is an OSS file.
- **Migrations included.** The drizzle and ClickHouse migration directories are identical in both repos, so a private PR's migration number is free in OSS too and any view body it copies forward is already correct there.
- **When one file carries two unrelated changes, stack the PRs** rather than splitting the file. Port the file wholesale in the later PR and hand-apply only the in-scope hunks in the earlier one — that's how `main.rs`, `signals/service.rs`, and the `docs/internal/` notes were split across the LAM-2237 series. Each PR is then based on the previous branch, so its diff shows only its own files.
- **A back-port can be older than it looks.** OSS's migration list is the tell: if a migration exists in OSS but the Rust code that reads its new shape doesn't, the public half of a private feature shipped alone (that's exactly how `0107_signal_filters_includes.sql` sat in OSS for weeks with an evaluator that still only understood `eq`/`ne`). When a doc bullet in `docs/internal/` contradicts the code, suspect a half-landed back-port before believing the doc.

## Conventions that exist because of the fork

- **A shared file that only PRIVATE consumers call still belongs in OSS verbatim** — it will emit a `dead_code` warning there, and that's the accepted convention (`db/projects.rs::get_project_name`, `db/agents.rs::AgentVersion`, `notifications/slack/mod.rs::fetch_thread_replies`). Don't "fix" it by adding an OSS-only `#[allow(dead_code)]`: that re-creates the drift. Only add `#[cfg_attr(not(feature = "signals"), allow(dead_code))]` when you're adding it to BOTH repos (as `worker/mod.rs` / `batch_worker/mod.rs` do for their enum variants). When the last private caller goes away too, the attribute becomes a plain `#[allow(dead_code)]` in both.
- **`main.rs` formatting drifts one-way and private wins.** Because OSS can't `cargo fmt` it without the stub dance in `docs/internal/app-server.md`, OSS's copy goes stale while private's gets reformatted; the fix is always to copy private's `main.rs` over, never to hand-reflow OSS's. The signals-gated route registrations inside it (`signals::private::routes::*`, `agent::routes::*`) are scaffolding OSS carries verbatim and must be copied along with the formatting.
- **Feature-flag names are the one thing to check by hand when copying.** OSS and private gate the same code on flags that were renamed at different times (`Feature::LlmProfiles` → `Feature::SignalLlmProfiles`), so a wholesale copy of `main.rs` / `signals/service.rs` can reintroduce a name that doesn't exist in the target repo. `cargo check` catches the flag, not the intent — reread the gate.
- **A comment that names one repo is a future divergence.** Prefer phrasing that is true in both ("the function builds under default features, so gating the tests on `signals` would skip them on a plain `cargo test`") over phrasing that only makes sense in one ("`--features signals` doesn't compile in OSS"). Private rewriting `db/utils.rs`'s comment this way is what let the file go back to being byte-identical.
