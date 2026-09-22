# Terraform provider handoff

## What this is

This directory contains a recovered, working prototype of a standalone Terraform Plugin Framework provider for Laminar. It currently manages Laminar Signals through the project API.

The Go module and release configuration assume the provider will eventually live in its own repository at `github.com/lmnr-ai/terraform-provider-laminar`. It is stored in the `lmnr` monorepo only to preserve and share the implementation.

## Current scope

- Provider configuration through `project_api_key` / `LMNR_PROJECT_API_KEY`
- Optional API override through `base_url` / `LMNR_BASE_URL`
- `laminar_signal` resource with create, read, update, delete, and import
- `laminar_signal` data source by Signal UUID
- Normalized JSON handling for structured output, trigger, and filters
- Unit tests, HTTP contract tests, an in-memory Terraform lifecycle test, and an opt-in live test
- OpenAPI generator inputs, generated provider specification, documentation, examples, and release scaffolding

The client expects these authenticated project API routes:

- `POST /v1/signals`
- `GET /v1/signals/{id}`
- `PATCH /v1/signals/{id}`
- `DELETE /v1/signals/{id}`

## Verified state

The recovered implementation passed these commands before handoff:

```shell
go test ./...
go vet ./...
go build ./...
TF_ACC=1 go test ./internal/provider -run TestAccSignalResourceLifecycle -count=1
```

A live acceptance test also previously passed against a local Laminar app-server. It is intentionally opt-in and was not rerun during recovery because it needs a running server and project API key.

## Run locally

Requirements: Go 1.25+, Terraform 1.0+.

```shell
cd lmnr-terraform-provider
go test ./...
TF_ACC=1 go test ./internal/provider -run TestAccSignalResourceLifecycle -v
go build ./...
```

For the live test:

```shell
LMNR_TF_LIVE_TEST=1 \
LMNR_PROJECT_API_KEY='<project-api-key>' \
LMNR_BASE_URL='http://localhost:8000' \
TF_ACC=1 \
go test ./internal/provider -run TestAccSignalResourceLive -count=1 -v
```

The live test creates and destroys a real Signal.

## Important repository caveat

GitHub only discovers workflows under the repository-root `.github/workflows` directory. The workflows in this directory came from the standalone provider scaffold and **will not run while nested in the `lmnr` monorepo**. They also assume `go.mod` is at repository root.

Before publishing or enabling CI, move this directory into its intended standalone repository or adapt the workflows into the monorepo root with appropriate working directories and path filters.

## Known limitations and decisions to revisit

- Only Signals are implemented.
- The provider depends on the Signal project API contract remaining compatible with the checked-in OpenAPI files and `internal/client/client.go`.
- Generated schemas are advisory; lifecycle behavior is handwritten because the OpenAPI generator does not cover all update/delete semantics and does not support the source specification's `allOf` shape.
- Release automation requires repository secrets for GPG signing and has not been exercised from this monorepo.
- Terraform Registry publication, ownership, provider namespace, versioning policy, and support status still need explicit decisions.
- Run the live acceptance test against the target deployment before release.

## Suggested next steps

1. Review the Signal API and provider schema together for contract drift.
2. Run all local tests and the live acceptance test.
3. Decide whether to keep this in the monorepo or create `lmnr-ai/terraform-provider-laminar`.
4. If extracting it, copy this directory without the parent repository history, then enable the included root-level workflows.
5. Configure GPG/release secrets, verify generated docs, and perform a prerelease before Registry publication.
