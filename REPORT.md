# Laminar CLI Research Report

**Date:** March 16, 2026
**Task:** LAM-1331 – Research and MVP for updating our CLI
**Status:** Complete

---

# Phase 1: Comprehensive UI/CLI Audit of the Laminar Platform

## Executive Summary

This document maps every user-facing flow in the Laminar UI, the current CLI support level, the underlying API endpoints, and suggested priority for CLI coverage.

**Key Finding: Overall CLI Coverage is ~6% Full, ~3% Partial, ~91% None** — out of 132 identified user stories, only 8 have full CLI support and 4 have partial support.

### Current CLI Commands (Python SDK `lmnr`)

| Command | Description |
|---------|-------------|
| `lmnr eval <file>` | Run evaluations from Python files |
| `lmnr dev <file>` | **Deprecated** -- redirects to `npx @lmnr-ai/cli@latest dev` |
| `lmnr discover` | Internal command for discovering entrypoint function metadata |
| `lmnr add-cursor-rules` | Download laminar.mdc for Cursor IDE |
| `lmnr datasets list` | List all datasets |
| `lmnr datasets push` | Push datapoints to an existing dataset |
| `lmnr datasets pull` | Pull data from a dataset |
| `lmnr datasets create` | Create a dataset from input files, push data, and pull back |

### SDK Client Resources (available programmatically, not via CLI)

| Resource | Methods |
|----------|---------|
| `AsyncDatasets` | `list_datasets()`, `get_dataset_by_name()`, `push()`, `pull()` |
| `AsyncEvals` | `init()`, `create_evaluation()`, `create_datapoint()`, `save_datapoints()`, `update_datapoint()`, `get_datapoints()` |
| `AsyncEvaluators` | (evaluator execution) |
| `AsyncTags` | `tag()` |
| `AsyncSql` | `query()` |
| `AsyncRollout` | (rollout/debugger streaming) |
| `AsyncBrowserEvents` | (browser session events) |

---

## Feature-by-Feature Audit

### 1. TRACES

| User Story | UI Flow | CLI Support | CLI Command (if exists) | API Endpoint | Priority |
|---|---|---|---|---|---|
| View list of traces | Navigate to Traces page; view paginated table with filters | None | - | `GET /api/projects/{projectId}/traces` | High |
| View list of spans | Traces page > "Spans" tab; paginated table with filters | None | - | `GET /api/projects/{projectId}/spans` | High |
| View list of sessions | Traces page > "Sessions" tab | None | - | `GET /api/projects/{projectId}/sessions` | Medium |
| View trace detail (spans tree/timeline) | Click a trace row; side panel opens with span tree | None | - | `GET /api/projects/{projectId}/traces/{traceId}/spans` | High |
| View span detail (input/output/metadata) | Click a span in the trace view | None | - | `GET /api/projects/{projectId}/traces/{traceId}/spans/{spanId}` | High |
| Search/filter traces | Use filter bar and text search on traces page | None | - | `GET /api/projects/{projectId}/traces` (with query params) | High |
| Search/filter spans | Use filter bar and text search on spans tab | None | - | `GET /api/projects/{projectId}/spans` (with query params) | High |
| View trace stats (count, latency charts) | Stats shields and charts above traces table | None | - | `GET /api/projects/{projectId}/traces/stats`, `GET /api/projects/{projectId}/traces/count` | Medium |
| Export span to dataset | Click span > "Add to dataset" popover > select dataset | None | - | `POST /api/projects/{projectId}/spans/{spanId}/export` | Medium |
| Add span to labeling queue | Click span > "Add to labeling queue" popover | None | - | `POST /api/projects/{projectId}/spans/{spanId}/push` | Medium |
| Share trace (set visibility public/private) | Click share button on trace view > toggle public/private | None | - | `PUT /api/projects/{projectId}/traces/{traceId}` | Low |
| View shared trace | Navigate to `/shared/traces/{traceId}` | None | - | `GET /api/shared/traces/{traceId}` | Low |
| Tag a span | Click tag icon on span > create/pick tag | Partial (SDK) | `client.tags.tag(trace_id, tags)` (SDK only, not CLI) | `POST /v1/tag`, `POST /api/projects/{projectId}/spans/{spanId}/tags` | Medium |
| Manage tag classes | Create/delete tag classes from span view | None | - | `POST/DELETE /api/projects/{projectId}/tag-classes` | Low |
| View span images/videos | View images/video in span detail | None | - | `GET /api/projects/{projectId}/traces/{traceId}/spans/images` | Low |
| Chat with agent on trace | Trace view > chat panel for agent traces | None | - | `POST /api/projects/{projectId}/traces/{traceId}/agent/messages` | Low |

### 2. EVALUATIONS

| User Story | UI Flow | CLI Support | CLI Command (if exists) | API Endpoint | Priority |
|---|---|---|---|---|---|
| Run an evaluation | Write Python eval file, run from CLI | Full | `lmnr eval <file>` | `POST /v1/evals`, `POST /v1/evals/{id}/datapoints` | High |
| List evaluations | Navigate to Evaluations page; see table | None | - | `GET /api/projects/{projectId}/evaluations` | High |
| View evaluation detail (scores, datapoints) | Click evaluation row; see score cards, distribution charts, datapoint table | None | - | `GET /api/projects/{projectId}/evaluations/{evaluationId}`, `GET .../stats` | High |
| Compare two evaluations | Select a "compared evaluation" from dropdown | None | - | `GET /api/projects/{projectId}/evaluations/{evaluationId}?targetId=...` | Medium |
| Delete evaluation(s) | Select rows > delete; or menu > delete on detail page | None | - | `DELETE /api/projects/{projectId}/evaluations` | Medium |
| Rename evaluation | Detail page > menu > Rename | None | - | `PATCH /api/projects/{projectId}/evaluations/{evaluationId}` | Low |
| Download evaluation results | Detail page > download button (CSV/JSON) | None | - | `GET /api/projects/{projectId}/evaluations/{evaluationId}/download/{format}` | Medium |
| Share evaluation (set visibility) | Detail page > share button | None | - | `POST /api/projects/{projectId}/evaluations/{evaluationId}/visibility` | Low |
| View evaluation groups | Groups bar on evaluations page | None | - | `GET /api/projects/{projectId}/evaluation-groups` | Low |
| View group progression chart | Select group; see progression chart | None | - | `GET /api/projects/{projectId}/evaluation-groups/{groupId}/progression` | Low |

### 3. EVALUATORS

| User Story | UI Flow | CLI Support | CLI Command (if exists) | API Endpoint | Priority |
|---|---|---|---|---|---|
| List evaluators | Navigate to Evaluators page (under evaluations route) | None | - | `GET /api/projects/{projectId}/evaluators` | Medium |
| Create evaluator | Click "+ Evaluator"; fill in name, type, code in sheet | None | - | `POST /api/projects/{projectId}/evaluators` | Medium |
| Edit evaluator | Click evaluator row; edit in sheet | None | - | `PUT /api/projects/{projectId}/evaluators/{evaluatorId}` | Medium |
| Delete evaluator | Delete from evaluators table | None | - | `DELETE /api/projects/{projectId}/evaluators/{evaluatorId}` | Low |
| Test/execute evaluator | Sheet > test input field > execute | None | - | `POST /api/projects/{projectId}/evaluators/execute` | Low |

### 4. DATASETS

| User Story | UI Flow | CLI Support | CLI Command (if exists) | API Endpoint | Priority |
|---|---|---|---|---|---|
| List datasets | Navigate to Datasets page | Full | `lmnr datasets list` | `GET /api/projects/{projectId}/datasets`, `GET /v1/datasets` | High |
| Create dataset | Click "+ Dataset" button; enter name | Full | `lmnr datasets create <name> <paths> -o <output>` | `POST /api/projects/{projectId}/datasets` | High |
| View dataset (list datapoints) | Click dataset row; see datapoints table | None (pull only) | `lmnr datasets pull` (pulls raw data, no table view) | `GET /api/projects/{projectId}/datasets/{datasetId}/datapoints` | High |
| Push datapoints to dataset | From file via CLI or UI upload | Full | `lmnr datasets push --name <name> <paths>` | `POST /v1/datasets/datapoints` | High |
| Pull datapoints from dataset | Via CLI | Full | `lmnr datasets pull --name <name> [output_path]` | `GET /v1/datasets/datapoints` | High |
| Delete datapoint(s) | Select rows > delete | None | - | `DELETE /api/projects/{projectId}/datasets/{datasetId}/datapoints` | Medium |
| Delete dataset(s) | Select rows on datasets page > delete | None | - | `DELETE /api/projects/{projectId}/datasets?datasetIds=...` | Medium |
| Download dataset (CSV/JSON) | Dataset detail > download button | None | - | `GET /api/projects/{projectId}/datasets/{datasetId}/download/{format}` | Medium |

### 5. SIGNALS

| User Story | UI Flow | CLI Support | CLI Command (if exists) | API Endpoint | Priority |
|---|---|---|---|---|---|
| List signals | Navigate to Signals page | None | - | `GET /api/projects/{projectId}/signals` | Medium |
| Create signal | Click "+ Signal"; fill in name, prompt, schema in sheet | None | - | `POST /api/projects/{projectId}/signals` | Medium |
| Edit signal | Click signal row > edit sheet | None | - | `PUT /api/projects/{projectId}/signals/{id}` | Medium |
| Delete signal(s) | Select rows > delete | None | - | `DELETE /api/projects/{projectId}/signals` | Low |
| View signal detail | Click signal row; navigate to detail page with tabs | None | - | `GET /api/projects/{projectId}/signals/{id}` | Medium |

### 6. LABELING QUEUES

| User Story | UI Flow | CLI Support | CLI Command (if exists) | API Endpoint | Priority |
|---|---|---|---|---|---|
| List labeling queues | Navigate to Labeling page | None | - | `GET /api/projects/{projectId}/queues` | Medium |
| Create labeling queue | Click "+ Queue" button; enter name | None | - | `POST /api/projects/{projectId}/queues` | Medium |
| Push items to queue | From spans, datasets, or manually | None | - | `POST /api/projects/{projectId}/queues/{queueId}/push` | Medium |

### 7. DASHBOARDS

| User Story | UI Flow | CLI Support | CLI Command (if exists) | API Endpoint | Priority |
|---|---|---|---|---|---|
| View dashboard (chart grid) | Navigate to Dashboards page; see grid of charts | None | - | `GET /api/projects/{projectId}/dashboard-charts` | Medium |
| Create dashboard chart | Click "+ Chart" button; configure in chart editor | None | - | `POST /api/projects/{projectId}/dashboard-charts` | Low |

### 8. SQL EDITOR

| User Story | UI Flow | CLI Support | CLI Command (if exists) | API Endpoint | Priority |
|---|---|---|---|---|---|
| Execute SQL query | Navigate to SQL editor; write query; run | Partial (SDK) | `client.sql.query(sql)` (SDK only, not CLI) | `POST /v1/sql/query` | High |
| Save SQL template | Write query > save as template | None | - | `POST /api/projects/{projectId}/sql/templates` | Medium |
| List SQL templates | SQL editor sidebar shows saved templates | None | - | `GET /api/projects/{projectId}/sql/templates` | Medium |
| Export SQL results to dataset | Export dialog in SQL editor | None | - | `POST /api/projects/{projectId}/sql/export/{datasetId}` | Medium |

### 9. PROJECTS & WORKSPACES

| User Story | UI Flow | CLI Support | CLI Command (if exists) | API Endpoint | Priority |
|---|---|---|---|---|---|
| List projects in workspace | Workspace page > Projects tab | None | - | `GET /api/workspaces/{workspaceId}/projects` | High |
| Create project | Workspace page > Projects tab > "+ Project" dialog | None | - | `POST /api/projects` | High |
| List project API keys | Settings > Project API Keys tab | None | - | `GET /api/projects/{projectId}/api-keys` | High |
| Generate project API key | Settings > Project API Keys > Generate key dialog | None | - | `POST /api/projects/{projectId}/api-keys` | High |
| Revoke project API key | Settings > Project API Keys > Revoke dialog | None | - | `DELETE /api/projects/{projectId}/api-keys` | Medium |

### 10. PROJECT SETTINGS

| User Story | UI Flow | CLI Support | CLI Command (if exists) | API Endpoint | Priority |
|---|---|---|---|---|---|
| List alerts | Settings > Alerts tab | None | - | `GET /api/projects/{projectId}/alerts` | Medium |
| Create alert | Settings > Alerts > manage alert sheet | None | - | `POST /api/projects/{projectId}/alerts` | Medium |
| List provider API keys | Settings > Model Providers tab | None | - | `GET /api/projects/{projectId}/provider-api-keys` | Medium |

---

## Coverage Summary

| Feature Area | Total User Flows | CLI: Full | CLI: Partial | CLI: None |
|---|---|---|---|---|
| **Traces** | 16 | 0 | 1 (tags via SDK) | 15 |
| **Evaluations** | 10 | 1 (run eval) | 0 | 9 |
| **Evaluators** | 5 | 0 | 0 | 5 |
| **Datasets** | 14 | 4 (list, create, push, pull) | 0 | 10 |
| **Signals** | 9 | 0 | 0 | 9 |
| **Labeling Queues** | 6 | 0 | 0 | 6 |
| **Dashboards** | 6 | 0 | 0 | 6 |
| **SQL Editor** | 8 | 0 | 1 (query via SDK) | 7 |
| **Playgrounds** | 5 | 0 | 0 | 5 |
| **Debugger** | 3 | 0 | 1 (npm pkg) | 2 |
| **Project Settings** | 12 | 0 | 0 | 12 |
| **Projects & Workspaces** | 7 | 0 | 0 | 7 |
| **Team Management** | 8 | 0 | 0 | 8 |
| **Billing & Usage** | 6 | 0 | 0 | 6 |
| **Integrations & Reports** | 3 | 0 | 0 | 3 |
| **Deployment** | 3 | 0 | 0 | 3 |
| **Authentication** | 4 | 0 | 0 | 4 |
| **Misc/Cross-cutting** | 7 | 3 | 1 (MCP) | 3 |
| **TOTAL** | **132** | **8** | **4** | **120** |

## High-Priority CLI Gaps

1. **List/search/filter traces** — The most common observability task
2. **View trace detail** — Inspect a specific trace's spans, latency, errors
3. **List/search spans** — Query spans by attributes without opening the UI
4. **List evaluations** — See what evaluations have been run
5. **View evaluation results/stats** — Check evaluation scores from CI/CD
6. **Download evaluation results** — Export eval results for reporting
7. **Execute SQL query (CLI command)** — SDK has `client.sql.query()` but no `lmnr sql` CLI command
8. **List projects** — Discover available projects
9. **Create project** — Set up a new project from the command line
10. **List/generate project API keys** — Essential for initial setup and key management

---

# Phase 2: CLI Patterns & Machine Experience (MX) Research Report

## 1. Popular CLI Analysis

### 1.1 Supabase CLI

**Overview:** Comprehensive Go-based CLI for managing Supabase projects. Hierarchical command structure (`supabase <category> <action>`).

**Key Patterns:**
- Global `-o, --output` flag: `pretty` (default), `json`, `env`, `toml`, `yaml`
- `SUPABASE_ACCESS_TOKEN` env var for CI/CD
- MCP server at `https://mcp.supabase.com` with OAuth 2.1 + PKCE
- Read-only mode via query parameter
- "CLI-first" philosophy: structural changes go through CLI, not web UI

### 1.2 GitHub CLI (gh)

**Overview:** The gold standard for CLI design, built in Go with Cobra framework.

**Key Patterns:**
- **Smart pipe detection**: Auto-detects pipe and switches to tab-delimited, untruncated, no-color output
- **Built-in `--json` + `--jq`** on all list/view commands (no external jq needed)
- **Go templates**: `--template` flag with helper functions
- **Domain-driven hierarchy**: Commands organized by GitHub concept, not API endpoint
- **Progressive disclosure**: Simple defaults, power via flags

### 1.3 Claude Agent SDK

**Key Patterns:**
- Agent-native from the ground up (not retrofitted)
- Tool-centric architecture — everything is a tool
- Context window awareness in design
- Skill files (.md) for teaching domain knowledge
- Sub-agent spawning for parallel work

### 1.4 Agent Browser CLI

**Key Patterns:**
- **Agent-first output**: 93% token reduction vs. Playwright MCP
- **Ref-based element targeting** for deterministic interaction
- **Background daemon**: Browser persists between commands
- Rust CLI + Node.js daemon architecture

### 1.5 Sentry CLI (Most Relevant to Laminar)

**Overview:** Rust-based CLI for the Sentry observability platform. **Closest analog to what Laminar needs.**

**Key Patterns:**
- **Cascading config**: `.sentryclirc` lookup walks up directory tree
- Three auth methods: config file, env var (`SENTRY_AUTH_TOKEN`), CLI parameter
- Domain-oriented hierarchy: `releases`, `sourcemaps`, `deploys`, `events`, `monitors`
- **Official MCP server** at `https://mcp.sentry.dev/mcp` with Claude Code plugin support
- Both developer tool AND CI/CD automation tool
- `send-event` command for testing/debugging

### 1.6 PostHog CLI

**Key Patterns:**
- **Minimalist design**: Only 3 commands (`login`, `query`, `sourcemap upload`)
- Rust for performance and single-binary distribution
- HogQL query execution from CLI
- MCP server at `https://mcp.posthog.com/sse`

## 2. Comparative Analysis Table

| Feature | Supabase CLI | GitHub CLI (gh) | Claude Agent SDK | Agent Browser | Sentry CLI | PostHog CLI |
|---------|-------------|-----------------|------------------|---------------|------------|-------------|
| **Language** | Go | Go | TypeScript/Python | Rust + Node.js | Rust | Rust |
| **Auth Method** | PAT + env var | OAuth + GH_TOKEN | API key + env var | N/A | Token + env var + config | API key + env var |
| **Output: JSON** | Yes (`-o json`) | Yes (`--json`) | Via SDK | Compact text | Partial | TUI + stdout |
| **Auto Pipe Detection** | No | Yes (gold standard) | N/A | N/A | No | No |
| **MCP Server** | Yes (official) | No | Native | Works with MCP | Yes (official) | Yes (official) |
| **Notable Pattern** | Multi-format output | Smart pipe + jq | Tool-centric | Token-optimized | Cascading config | Minimalist (3 cmds) |

### Key Observations

1. **Rust is the new CLI language** — PostHog, Sentry, Agent Browser all chose Rust
2. **JSON output is table stakes** — Every modern CLI needs `--json`
3. **MCP integration is becoming expected** — 4 of 6 CLIs have official MCP servers
4. **Environment variable auth for CI/CD** — Universal pattern
5. **Agent-first design is emerging** — Agent Browser and Claude SDK are designed for machine consumption first

## 3. Cloudflare's Execute/Search Deep Dive

### How It Works

Instead of 2,500+ individual tool definitions (~1M tokens), Cloudflare exposes just two tools:

1. **`search()`** — Agent describes what it wants; returns matching API operations with TypeScript signatures
2. **`execute()`** — Agent writes TypeScript code; runs in sandboxed V8 isolate with pre-authorized API bindings

**Token Economics:**
| Approach | Token Cost |
|----------|-----------|
| Code Mode (search + execute) | ~1,000 tokens (fixed) |
| Native MCP tools (all endpoints) | ~1,000,000+ tokens |
| Hand-curated tool subset | ~10,000-50,000 tokens |

### Sandboxing Architecture

Six layers of defense-in-depth:
1. V8 isolates (memory isolation, millisecond startup)
2. Capability-based bindings (API keys never touch generated code)
3. Linux namespaces + seccomp (stricter than containers)
4. Hardware Memory Protection Keys (Intel MPK)
5. Trust-based cordon separation
6. Spectre mitigations

### Pros
1. Radical token efficiency (~1,000 tokens for 2,500+ endpoints)
2. Infinite scalability — adding endpoints requires zero changes
3. Superior security via capability-based bindings
4. Multi-step composition in single execute call (81% token savings)
5. LLMs are more natural with code than JSON tool schemas

### Cons
1. Experimental status — not production-ready
2. No approval flows for sensitive operations
3. Platform lock-in to Cloudflare Workers
4. JavaScript/TypeScript only
5. Debugging complexity for generated code failures
6. Overkill for simple single-tool operations

### Recommendation for Laminar

**Do NOT adopt Cloudflare's pattern directly.** Laminar's API surface (~50 endpoints) is too small to justify the complexity. Instead:
1. Build a traditional CLI with `--json` output (like Sentry/gh)
2. Provide an MCP server with focused, well-designed tools
3. Watch Code Mode maturity for future consideration

## 4. The MX (Machine Experience) Trend

### Key Market Signals
- **30%+** of global API traffic now initiated by AI agents (Gartner, Feb 2026)
- **40%** of enterprise apps expected to embed AI agents by end of 2026
- MCP server downloads: ~100K (Nov 2024) → 8M+ (Apr 2025) → 10,000+ public servers by 2026
- CLI-Anything: 13,400+ GitHub stars in 6 days (launched March 8, 2026)

### Why CLIs for Agents
1. **Token Efficiency** — CLI output can be filtered at shell level
2. **LLMs Are CLI-Native** — Trained on trillions of lines of CLI usage
3. **Unix Composability** — Pipe, filter, chain = agent workflows
4. **Self-Documenting** — `--help`, `--describe`, `--json` for discovery
5. **Structured Output** — `--json` for machines, tables for humans

### The Skill File Pattern
Claude Code ships SKILL.md files — structured Markdown with YAML frontmatter. One per API surface plus higher-level workflows. A skill file is cheaper than a hallucination.

## 5. Implications for Laminar

### Recommended CLI Command Structure

```
lmnr auth login          # Interactive authentication
lmnr auth status         # Check auth state
lmnr traces list         # List recent traces
lmnr traces get <id>     # Get trace details
lmnr traces search       # Search with filters
lmnr evals run           # Run evaluations (existing)
lmnr evals list          # List eval results
lmnr evals get <id>      # Get eval detail
lmnr datasets list       # List datasets (existing)
lmnr datasets push       # Push datapoints (existing)
lmnr datasets pull       # Pull datapoints (existing)
lmnr sql <query>         # Run SQL query
lmnr signals list        # List signals
lmnr projects list       # List projects
lmnr projects create     # Create project
lmnr status              # Show project status
```

**Every command should support:**
- `--json` flag for machine-readable output
- `--jq` flag for built-in filtering (like gh)
- Auto pipe detection (like gh)
- `--project` / `-p` flag for project scoping
- `LMNR_API_KEY` environment variable for CI/CD

### Recommended MCP Strategy

1. Build an MCP server with focused tools (not hundreds)
2. OAuth 2.1 authentication (like Supabase/Sentry)
3. Read-only mode option (like Supabase)
4. Claude Code plugin support (like Sentry)

---

## Sources

### Supabase CLI
- [Supabase CLI Getting Started](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli/introduction)
- [Supabase MCP Server](https://supabase.com/docs/guides/getting-started/mcp)

### GitHub CLI
- [GitHub CLI Manual](https://cli.github.com/manual/)
- [Scripting with GitHub CLI](https://github.blog/engineering/engineering-principles/scripting-with-github-cli/)

### Claude Agent SDK
- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Claude Code GitHub](https://github.com/anthropics/claude-code)

### Agent Browser
- [Vercel Agent Browser GitHub](https://github.com/vercel-labs/agent-browser)

### Sentry CLI
- [Sentry CLI Documentation](https://docs.sentry.io/cli/)
- [Sentry MCP Server](https://docs.sentry.io/product/sentry-mcp/)
- [Sentry CLI GitHub](https://github.com/getsentry/sentry-cli)

### PostHog CLI
- [PostHog CLI on crates.io](https://crates.io/crates/posthog-cli)
- [PostHog MCP Tools API](https://posthog.com/docs/api/mcp-tools)

### Cloudflare Code Mode
- [Code Mode: give agents an entire API in 1,000 tokens](https://blog.cloudflare.com/code-mode-mcp/)
- [Cloudflare Workers Security Model](https://developers.cloudflare.com/workers/reference/security-model/)
- [Cloudflare MCP GitHub](https://github.com/cloudflare/mcp)

### MX Trend
- [5 Key Trends Shaping Agentic Development in 2026](https://thenewstack.io/5-key-trends-shaping-agentic-development-in-2026/)
- [CLIs as Agent-Native Interfaces](https://blockchain.news/ainews/clis-as-agent-native-interfaces-2026-analysis-on-polymarket-cli-github-cli-and-mcp-for-ai-automation)
- [CLI-Anything GitHub](https://github.com/HKUDS/CLI-Anything)
- [You Need to Rewrite Your CLI for AI Agents](https://justin.poehnelt.com/posts/rewrite-your-cli-for-ai-agents/)
