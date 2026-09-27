# Terraform provider handoff

The provider lives in the `lmnr` monorepo for now. The Go module (`github.com/lmnr-ai/terraform-provider-laminar`), `.github/` workflows, `.goreleaser.yml`, and `terraform-registry-manifest.json` are set up for its own repository. To extract it, copy this directory's contents to the root of `lmnr-ai/terraform-provider-laminar` without the monorepo history.

## Scope

See the table in `README.md`. Everything goes through the project API (`/v1/project`, `/v1/signals`, `/v1/datasets`, `/v1/llm-profiles`) with a project API key.

## Verified state

- `go vet ./...`, `go test ./...`, `TF_ACC=1 go test ./internal/...`: unit tests, OpenAPI contract tests, and Terraform CLI lifecycle, import, and validation tests against an in-memory API.
- `TestAccLive`: passed against a local self-hosted app-server with `LMNR_TF_LIVE_SELF_HOSTED=1`. It covered create, update, import, and data sources for all three resources, plus Signal routing through an LLM profile.

## Keeping it in sync with the API

- `openapi/openapi.yaml` is a copy of `docs/openapi/openapi.yaml`. Run `make sync-openapi` after an API change. The contract test fails if a client type's JSON fields no longer match the spec.
- Validation that goes beyond the spec mirrors the app-server so mistakes fail at plan time:
  - Signal filter columns and operators mirror `FILTER_COLUMNS` in `app-server/src/signals/service.rs`.
  - LLM profile per-provider fields mirror `app-server/src/llm/profiles/service/provider_fields.rs`.
  - Update both when the server changes.
- The docs spec's `LlmProfileProvider` enum is missing `custom_responses`, which the server supports. The provider accepts it.

## Before publishing

1. Create the repository and move this directory to its root. GitHub only runs workflows from the root `.github/workflows`, so the workflows here don't run inside `lmnr`.
2. Configure the GPG key and passphrase secrets for `release.yml`, then register `lmnr-ai/laminar` in the Terraform Registry.
3. Tag a prerelease and run `TestAccLive` against Laminar Cloud (without `LMNR_TF_LIVE_SELF_HOSTED`).
4. Add public documentation to the docs site.

## Decisions to revisit

- LLM profile secrets are sensitive values in state. Once Terraform ≥ 1.11 can be the minimum version, they could become write-only attributes (`WriteOnly`, with a version attribute that triggers rotation). That would keep them out of state.
- Signal alerts and dataset datapoints are not managed.
