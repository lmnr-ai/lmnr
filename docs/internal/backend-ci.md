# Backend PR CI (`.github/workflows/backend-build-and-test.yml`)

Builds the `builder` stage of `app-server/Dockerfile` on `ubuntu-24.04-arm` (native arm64, no QEMU) and runs `cargo test --release` inside it. `lmnr-private` does **not** carry this workflow — it has no Rust build/test CI at all, so a `signals`-feature break is not caught by CI anywhere.

## Where the time goes

Measured baseline (run `42609376255`, warm): `cargo build --release` of the app-server crate 3m07s, test-binary compile 4m51s, **1123 tests execute in 1.26s**. Nearly all of a run is `rustc`; the test suite itself is free. Queue time is negligible (step sum ≈ wall clock), so a slow run is always compilation, never runner availability.

## Actions caches are branch-scoped — warm `dev` or every PR is cold

A run can read its own branch's cache scope and the base branch's, nothing else. With a `pull_request`-only trigger nothing ever wrote into `dev`'s scope, so **every new branch's first run was a full cold dependency build** (~17 min vs ~10 min warm), and `restore-keys` had nothing to fall back to. Two runs with a byte-identical key, differing only in branch, showed `Cache hit` and `Cache not found` respectively. Durations were perfectly bimodal by "first run on this branch".

Hence the `push: branches: [dev]` trigger. It exists to populate the cache, not to validate `dev`; keep its `paths` list in sync with the `pull_request` one (GitHub Actions does not support YAML anchors, so they are duplicated).

Related constraints:

- PR runs **restore only**. A cache written from a PR run lands in that PR's own scope where nothing else can read it, while still counting against the repo's 10 GB quota and evicting the `dev` entry that PRs do read. Only the `dev` push writes (`actions/cache/save`, gated on `cache-hit != 'true'`).
- The quota bites: entries are >1.3 GB and the repo was once sitting at 10.85 GB across 7 caches — six of which were the *same key* in six different branch scopes — so everything was being LRU-evicted within a day. Check with `gh api repos/:owner/:repo/actions/cache/usage` and `gh cache list` before blaming a cache miss on anything subtler.
- `cache-to` writes to `/tmp/.buildx-cache-new` and a later step swaps the directory in. buildkit cannot read and write the same local cache dir, and exporting onto the restored directory makes it grow without bound.
- `cancel-in-progress` is `${{ github.event_name == 'pull_request' }}`, not `true`: consecutive merges share `refs/heads/dev`, so unconditional cancellation keeps killing the run that populates the cache.

## `cargo test` needs its own cooked dependency layer

`app-server/Cargo.toml` has `[dev-dependencies] tokio = { features = ["test-util"] }` (for `#[tokio::test(start_paused = true)]`). That single feature is absent from the binary's resolution, so `cargo build` and `cargo test` unify features differently and resolve **different fingerprints for tokio and for every crate downstream of it** — `tokio-util`, `tokio-rustls`, `h2`, `hyper`, `hyper-util`, `actix-rt`, `aws-smithy-*`: 71 crates, ~2 min, on every run. Verify the divergence with:

```bash
cargo tree --format "{f}" -p tokio --depth 0          # test resolution: has test-util
cargo tree -e no-dev --format "{f}" -p tokio --depth 0  # binary resolution: does not
```

So the Dockerfile cooks dependencies **twice**: `cargo chef cook --release` then `cargo chef cook --release --tests`. Both fingerprints then coexist in `target/release/deps` and neither build rebuilds the other's. Notes:

- Keep the plain cook **first and present**. Cooking only `--tests` would leave the binary's (no-`test-util`) variant missing and move the 71-crate rebuild into the uncached application layer, which is strictly worse.
- `cargo chef prepare` preserves dev-dependency features in the recipe (`[dev-dependencies.tokio] features = ["test-util"]`), which is what makes `--tests` cook the right set. Simple dev-deps are emitted inline under `[dev-dependencies]` while featured ones get their own `[dev-dependencies.<name>]` table — grep for both before concluding a recipe dropped something.
- This only moves the *dependency* rebuild into the cached layer. Compiling app-server's own test harness (~2-3 min) is not cacheable across commits; eliminating it means not building release artifacts on PRs at all.

`cargo install cargo-chef` in the `chef` stage compiles from source and costs minutes whenever that layer invalidates (rust bump, apt change); the prebuilt `lukemathwalker/cargo-chef` image avoids it.

## Validating a change to this workflow

`docker run --rm -v "$PWD:/repo:ro" --workdir /repo rhysd/actionlint:latest <file>` catches expression and schema errors. A full `docker build` of `app-server` is **not** runnable in the agent sandbox (1 core / 2 GB RAM against a 692-crate release build); exercise cargo-chef behaviour on a throwaway crate that reproduces the dependency pattern instead, and let CI itself confirm the real build.
