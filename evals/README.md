# Harbor evals

Each dataset has one image and task data under `tasks/`. From the repo root, pull pinned cases with `npx -y lmnr-cli@latest eval dataset pull`, then run remotely with `npx -y lmnr-cli@latest eval run --remote`. After changing task folders push with `npx -y lmnr-cli@latest eval dataset push` and commit the updated `tasks/dataset.toml`.
