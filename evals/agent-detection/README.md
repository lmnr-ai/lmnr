# Agent check minimum: trace-derived live-model replays

These tasks drive the **actual Rust detection agent loop**, `DetectionAgent::converse`, with an Azure-hosted live model and replayed prompt/check inputs. The task driver is a test-only adapter; it does **not** test the scheduled ClickHouse/Postgres sampling or persistence. The prompts are short, sanitized excerpts/reconstructions (not byte-for-byte production snapshots), with runtime metadata, secrets, and organization PII omitted. Known agents include only the directly relevant older checks, not the full production agent catalog; compare outcomes with that scope in mind. No external service is mocked. LLM and tool calls are recorded as `tool_calls.jsonl` / `rust.log` under the trial's agent files; the trace does not contain individual Rust spans.

| Case | Source trace | Why included | Verification |
|---|---|---|---|
| `singletons-and-pair` | ddf0fad3-3f5d-c38d-eedb-a4e460aac7e6 | Six role updates each matching one or two prompts, all rejected in production | No `submit` rejection for fewer than three prompts |
| `one-off-batch` | a2c5f86c-81c7-46ed-2b00-b4a795bcfd30 | Separate one-off role updates bundled into one rejected batch | No `submit` rejection for fewer than three prompts |
| `recurring-meetings` (control) | a2c5f86c-81c7-46ed-2b00-b4a795bcfd30 | Meetings was the only three-prompt candidate in this trace | At least one accepted item, no insufficient-prompt rejection |

The primary score is 1 when no under-threshold update was submitted AND no unrelated roles were merged into a generic new agent; negative cases require zero accepted changes. The control additionally requires a real accepted submission, to prevent no-op models from trivially passing. A live-model run that fails or times out gets 0. Cases can be expanded with more of the original root span openings, but do not include raw sensitive runtime headers. Note that the verifier checks submit outcomes, not probe eligibility in isolation.

## Initial remote runs (3 attempts per case, `gpt-5.6-terra`)

- [Pre-fix baseline](https://laminar.sh/project/e06d1298-c56f-4e77-92f1-dddc0ba6cfa7/evaluations/42b504aa-8cb7-4a17-9c8b-8f4d8a03007a): 3/9 pass. The Meetings control passed all 3; both negative cases failed all 3, including one trial with the source cluster's exact under-threshold submit rejection.
- [Current proposed fix](https://laminar.sh/project/e06d1298-c56f-4e77-92f1-dddc0ba6cfa7/evaluations/4369a0de-1c73-440c-b2c3-057eda9464b9): 6/9 pass. The control and `singletons-and-pair` each passed 3/3; `one-off-batch` failed 3/3 because the model invented an overbroad shared-platform agent across unrelated roles. **This dataset has caught an unresolved false-grouping failure; do not treat the fix as fully passing.** These are sanitized short excerpts, not the full 157 KB source trace payload, and should not be interpreted as production pass rates.

The builder stage includes the sandbox's public TLS egress CA certificate so Cargo can fetch its pinned Git dependency through the sandbox proxy. Only the build stage trusts this CA; it is not present in the trial runtime image. Builders outside this sandbox should assess whether they need this extra trust root.

From the repo root: `npx -y lmnr-cli@latest eval dataset pull` after cloning, then `npx -y lmnr-cli@latest eval run agent-detection --remote`. Requires `AZURE_OPENAI_API_KEY` and `AZURE_OPENAI_ENDPOINT`. After editing a task: `npx -y lmnr-cli@latest eval dataset push agent-detection` and commit `tasks/dataset.toml`. Task bodies are stored in Laminar, not git.
