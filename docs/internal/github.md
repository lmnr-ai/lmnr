# GitHub App integration

<!-- Detailed working notes for coding agents and developers. -->
<!-- Referenced from the index in the repo-root CLAUDE.md; read when working in this area. -->
<!-- Sibling files in docs/internal/ may be cross-referenced by section name. -->

- A **GitHub App** (not the `AUTH_GITHUB_*` sign-in OAuth App, which is unrelated). Two apps in the `lmnr-ai` org: **Laminar** (prod, public) and **Laminar Dev** (private, localhost/staging callbacks, webhook via a smee.io channel). Permissions: Metadata read, Contents rw, Pull requests rw, Checks read, Actions read. No org permissions and no Workflows: adding a permission later makes every org owner re-approve.
- `Feature.GITHUB` is on when all `GITHUB_APP_*` + `GITHUB_STATE_SECRET` env vars are set (`lib/github/config.ts`). Self-hosted leaves them unset. `GITHUB_APP_PRIVATE_KEY` is the `.pem` **base64-encoded**. The JWT `iss` is the client ID, not the app ID.
- Storage: `github_integrations` (one per workspace; `installation_id` unique, which enforces one GitHub account to one workspace) and `project_github_repos` (one per project, keyed on GitHub's immutable `repo_id`). No tokens are stored. Unscoped installation tokens are cached in Redis for 55 min; scoped ones (`createRepoCloneToken`, `openPullRequestFromDiff`, `getInstallationRepo`) are minted fresh.
- Code: GitHub API in `lib/github/` (plain `fetch` + `jsonwebtoken`, no Octokit), DB actions in `lib/actions/github/`, routes `app/api/integrations/github/{install,callback}`, `app/api/webhook/github`, `app/api/workspaces/[id]/github`, `app/api/projects/[id]/github/{repo,repos}`.

## Connect flow

- `/install` and `/callback` are outside the `proxy.ts` matcher and check the session themselves. Connecting needs owner/admin; if the workspace is already connected, `/install` sends any member straight back with `?github=connected` (repo picker).
- `state` is HMAC-signed (`GITHUB_STATE_SECRET`) and carries `{userId, workspaceId, projectId, returnTo}`; its nonce is single-use in the cache (10 min). The callback also requires `session.user.id === state.userId`.
- **The callback's `installation_id` is spoofable.** It is trusted only after exchanging `code` for a user token and finding the id in `GET /user/installations`. Dropping that check lets anyone link another company's install.
- `setup_action=request` (a non-owner asked their org owner) returns `?github=pending` and links nothing; the later `installation.created` webhook doesn't say which workspace asked, so the user clicks Connect again after approval.
- Repo access edited on GitHub's installation settings page redirects back with no `state`; the callback looks the installation up and lands on that workspace's integrations settings.
- An installation with exactly one repo is auto-linked to the project.
- Result is `?github=connected|pending|taken|error` on `returnTo` (`taken` = the GitHub account is on another workspace; don't reveal which).

## Repos and webhooks

- `PUT /api/projects/[id]/github/repo` validates access by minting a token scoped to that `repository_ids`; GitHub answers 422 for a repo outside the installation. `GET /repos/{id}` is not a valid check, since installation tokens can read any public repo.
- The repo list is cached for 2 min per installation ("All repositories" installs page through thousands). `installation_repositories` / `repository` webhooks and the callback drop it.
- "Change access" links go to `github.com/apps/<slug>/installations/new`, not the installation's `html_url`: the org settings page 404s for non-owners.
- Webhook verifies `X-Hub-Signature-256` on the raw body, dedups `X-GitHub-Delivery` for a day, handles `installation.{deleted,suspend,unsuspend}`, `installation_repositories.removed`, `repository.{renamed,transferred,deleted}`.
- Disconnect and workspace delete call `DELETE /app/installations/{id}` (404 is success).

## Opening PRs

- `openPullRequestFromDiff` (`lib/github/pull-request.ts`): rejects `.github/workflows/` changes (no Workflows permission), creates `laminar/…` at the base SHA, commits via GraphQL `createCommitOnBranch` (GitHub-signed, so "Verified"), opens the PR against the repo's current default branch.
- The agent harness gets a read-only `createRepoCloneToken` and drops it after cloning; the agent never sees a token. The Modal trigger route is not built yet.
