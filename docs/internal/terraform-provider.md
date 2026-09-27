# Terraform provider (`lmnr-terraform-provider/`)

A standalone Go module (`github.com/lmnr-ai/terraform-provider-laminar`), parked in the monorepo until it moves to its own repository. It is not part of any monorepo build or CI: its nested `.github/workflows` never run here. Run its tests by hand (`cd lmnr-terraform-provider && TF_ACC=1 go test ./internal/...`).

- **Hand-written, not generated.** `tfplugingen-openapi` can't parse the spec's `allOf`/`oneOf` shapes and generates no CRUD logic. Drift protection comes from `internal/client/contract_test.go`, which checks client JSON tags against the vendored `openapi/openapi.yaml`.
- **Changing the signal, dataset, or LLM-profile project API** (`/v1/signals`, `/v1/datasets`, `/v1/llm-profiles`) means updating the provider too:
  - Refresh the vendored spec with `make sync-openapi`.
  - Mirror any plan-time validation copies: the `signalFilterColumns` and `FILTER_COLUMNS` (`signals/service.rs`) pair, and the `llmProviderFields` and `llm/profiles/service/provider_fields.rs` pair.
- **`provider` is a reserved root attribute name in Terraform** (schema load fails), so the LLM profile field is `llm_provider`.
- **Signal and dataset DELETE purge ClickHouse data synchronously.** They took about 62s on staging, so the client's HTTP timeout is 5 minutes. Keep API-level timeouts above that.
- **The API does not preserve JSON key order** of `structuredOutput`. The provider re-marshals it with sorted keys (like `jsonencode`), or import-verify diffs.
- `docs/openapi/openapi.yaml`'s `LlmProfileProvider` enum is missing `custom_responses`, which the server accepts.
- **Running the live test** (`TestAccLive`, gated by `LMNR_TF_LIVE_TEST=1`):
  - It needs an app-server and a project key.
  - Add `LMNR_TF_LIVE_SELF_HOSTED=1` only when `LAMINAR_CLOUD` is unset. Self-hosted requires `llmProfileId` and `model` on Signals; Cloud rejects them.
