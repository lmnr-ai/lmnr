# OSS image release (`.github/workflows/build-push.yml`)

Applies to the public `lmnr-ai/lmnr` repo only. lmnr-private does not carry this workflow (its release CI is in its own `docs/internal/release-ci.md`); when syncing upstream into lmnr-private, keep it deleted there.

- Runs on `release: published`. Builds `ghcr.io/lmnr-ai/app-server` and `ghcr.io/lmnr-ai/frontend` per arch (pushed by digest), merges them into multi-platform tags, and attests the index digest with `actions/attest` (`push-to-registry: true`), so `gh attestation verify oci://ghcr.io/lmnr-ai/<image>:<tag> --repo lmnr-ai/lmnr` checks the source repo and commit.
- The `verify-source` job gates every build (LAM-2384): it checks out `github.repository` at `github.sha` without persisted credentials and fails unless the release tag points to that commit and the commit is on `main`. Release tags are cut from `main` after `dev` is merged; a tag on a `dev`-only commit fails the release.
- Every checkout is pinned to `repository: ${{ github.repository }}` / `ref: ${{ github.sha }}`. Keep the verification inline: a local composite action would be loaded from the checked-out tree, which is the code being verified.
- Actions are pinned to commit SHAs with a `# vX.Y.Z` comment; bump by resolving the new tag's SHA (`gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`) or via the dependabot `github-actions` entry, never back to a floating tag.
