# Terraform provider

The Laminar Terraform provider lives in [lmnr-ai/terraform-provider-laminar](https://github.com/lmnr-ai/terraform-provider-laminar). It wraps the project API for Signals (`/v1/signals`), LLM profiles (`/v1/llm-profiles`) and `/v1/project`. Datasets are intentionally not a resource. It is hand-written; its `CLAUDE.md` has the provider-side details.

Changing those endpoints here breaks or drifts the provider:

- The provider vendors `docs/openapi/openapi.yaml` and checks its client types against it. Update the docs spec, then run `make sync-openapi` in the provider repo.
- The provider copies some server validation so mistakes fail at `terraform plan`. Mirror changes in the provider when you edit:
  - `FILTER_COLUMNS` (`signals/service.rs`), mirrored by `signalFilterColumns`.
  - `llm/profiles/service/provider_fields.rs`, mirrored by `llmProviderFields`.
  - Signal defaults: filter `total_token_count gt 1000`, trigger `rootSpanFinished`, mode `realtime`.
- Signal DELETE purges ClickHouse data synchronously. It took about 62s on staging, and the provider's HTTP timeout is 5 minutes. Keep deletes under that, or make them async.
- Response JSON key order for `structuredOutput` isn't preserved. The provider normalizes it, so this is safe to leave as is.
- `docs/openapi/openapi.yaml`'s `LlmProfileProvider` enum is missing `custom_responses`, which the server accepts.
