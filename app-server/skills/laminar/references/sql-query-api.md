# SQL Query API

Run SELECT-only ClickHouse SQL over your project's data. Two ways in:

- **CLI** — `lmnr-cli sql query "<sql>"` (see [cli.md](cli.md)). Use the CLI is the most convenient way to query.
- **HTTP API** — `POST /v1/sql/query` (covered below). Only use the HTTP API for scripting or if you don't have CLI access.

## Endpoint and auth

- **Method/path:** `POST /v1/sql/query`
- **Base URL:** `https://api.lmnr.ai` by default. For self-hosted, use your Laminar base URL.
- **Headers:**
  - `Authorization: Bearer <project_api_key>`
  - `Content-Type: application/json`
  - `Accept: application/json`

## Request body

```json
{
  "query": "SELECT * FROM spans WHERE start_time > now() - INTERVAL 1 DAY",
  "parameters": {}
}
```

- `query` is required and must be SELECT-only.
- `parameters` is optional (send `{}` when unused). Placeholders use typed syntax `{name:Type}`:

```json
{
  "query": "SELECT * FROM spans WHERE trace_id = {trace_id:UUID} AND start_time > now() - INTERVAL 1 DAY",
  "parameters": { "trace_id": "01234567-89ab-4def-1234-426614174000" }
}
```

## Response

```json
{ "data": [ { "name": "span1", "output": "{\"result\": \"ok\"}" } ] }
```

`data` is an array of row objects. Non-2xx responses include an error body; SDKs raise.

## Tables

SELECT only. Queries are scoped to your project automatically — no tenant filter needed.

- **Traces and spans:** `spans`, `traces`, `trace_outputs` (extracted agent output messages), `logs`
- **Signals:** `signals`, `signal_events`, `signal_events_all` (L0-inclusive), `signal_runs`, `clusters`, `event_clusters_all`
- **Datasets and evals:** `datasets`, `dataset_datapoints`, `dataset_datapoint_versions`, `evaluations`, `evaluation_trials` (one row per trial; `evaluation_datapoints` is an alias), `labeling_queue_items`

`signals`, `evaluations`, and `datasets` hold the definitions (`signals` adds `prompt`, `structured_output_schema`, `llm_model`, `version`; `evaluations` adds `group_id`, `metadata`). For just the name, skip the join: `signal_events.signal_name`, `evaluation_trials.evaluation_name`, `dataset_datapoints.dataset_name`. Filtering on a name scans the whole project, so filter by id when you have it. On self-hosted, these tables and name columns error until `CLICKHOUSE_POSTGRES_USER` / `CLICKHOUSE_POSTGRES_PASSWORD` are set.

Anything else is rejected (`Table 'x' is not allowed`), as is a column that isn't on the table — there is no `events` or `tags` table, for instance; tags are the `tags` / `trace_tags` columns on `traces`. Don't guess: **`lmnr-cli sql schema` prints the live schema**. `project_id` is never queryable — the query is already scoped.

## Query guidance

- **Always filter by time** (`start_time`) for performance.
- **Avoid joins** — run multiple queries and combine in your app. Two exceptions: `traces` carries the trace's signal events and clusters as array columns, so read those instead of joining (see below), and joining a definition table on its id (`signals.id = signal_id`) is cheap.
- **Bucket by interval** with `toStartOfInterval` / `toStartOfDay` / `toStartOfHour`.
- **JSON is stored as strings** — use `simpleJSONExtract*` for fast access and `simpleJSONHas` to check keys.
- **Common JSON columns:** `spans` → `input`, `output`, `attributes`; `evaluation_trials` → `data`, `target`, `metadata`, `executor_output`, `scores`; `dataset_datapoints` → `data`, `target`, `metadata`.

## Signals and clusters

A Signal is a natural-language outcome or failure definition; each match is a **signal event** on a trace, and similar events are grouped into named **clusters**.

`traces` carries both as array columns, so a trace row already tells you what fired on it:

- `signal_events` — `Array(Tuple(event_id UUID, signal_id UUID, severity UInt8, payload String))`. `severity` is `0` INFO / `1` WARNING / `2` CRITICAL. Empty for traces no Signal fired on.
- `clusters` — `Array(Tuple(id UUID, signal_id UUID, name String, level UInt8, parent_id UUID, num_signal_events UInt32, created_at, updated_at))`, names already resolved. Empty until events are clustered.

Start here to find out *what* is going wrong, because cost, duration, status, and metadata sit on the same row:

```sql
-- Which failure clusters am I paying the most for?
SELECT c.name AS cluster, count() AS traces, round(sum(t.total_cost), 4) AS cost
FROM traces AS t
ARRAY JOIN t.clusters AS c
WHERE t.start_time > now() - INTERVAL 7 DAY AND c.level = 1
GROUP BY cluster ORDER BY cost DESC LIMIT 20

-- Did anything critical fire today, and on which traces?
SELECT t.id AS trace_id, t.end_time, e.signal_id, substring(e.payload, 1, 2000) AS payload
FROM traces AS t
ARRAY JOIN t.signal_events AS e
WHERE t.start_time > now() - INTERVAL 1 DAY AND e.severity = 2
ORDER BY t.end_time DESC LIMIT 50

-- How much of my traffic does any Signal fire on?
SELECT countIf(notEmpty(signal_events)) AS with_signal, countIf(empty(signal_events)) AS without
FROM traces WHERE start_time > now() - INTERVAL 1 DAY
```

A trace's `clusters` holds the finest cluster of every event on it (`level = 1`) **plus its ancestors as separate elements** — hence the `level` filter, or the trace is counted once per level of the hierarchy.

Once you know which cluster or signal you care about, `signal_events` is where the numbers live: one row per event, plus `timestamp`, `signal_name`, `run_id`, and `signal_version`, which the trace columns don't carry.

```sql
-- Is this cluster growing or did it spike once?
SELECT toStartOfDay(timestamp) AS day, count() AS events, max(severity) AS severity
FROM signal_events
WHERE has(leaf_clusters, toUUID('<cluster_id>'))
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY day ORDER BY day
```

Its cluster columns are `clusters` (`Array(UUID)`, leaf + ancestors), `leaf_clusters` (`Array(UUID)`, level 1 only — unnest this when each event must be counted once), and `cluster_details`, which resolves ids to names and levels. `cluster_details` is an **unnamed** tuple, so read it positionally — `c.1` id, `c.2` name, `c.3` level — whereas the tuples on `traces` are named and take `c.name` / `c.level`:

```sql
SELECT timestamp, signal_name, severity, trace_id,
       arrayMap(c -> c.2, cluster_details) AS clusters,
       substring(payload, 1, 2000) AS payload
FROM signal_events
WHERE timestamp > now() - INTERVAL 1 DAY
ORDER BY timestamp DESC LIMIT 20
```

`payload` is the event's content — there is no `summary` column — and it is large, so wrap it in `substring` and keep the time filter, or the result can exceed the size limit. `empty()` / `notEmpty()` read only the array length.

Use `clusters` on its own for questions about the hierarchy (sizes, parents, naming) with no trace or event involved, and `event_clusters_all` when you want (event, cluster) pairs pre-unnested.

## Example queries

Cost by model:

```sql
SELECT model, sum(total_cost) AS total_cost, count(*) AS call_count
FROM spans
WHERE span_type = 'LLM' AND start_time > now() - INTERVAL 7 DAY
GROUP BY model ORDER BY total_cost DESC
```

Slowest operations (`duration` is a column, in seconds — don't subtract the timestamps):

```sql
SELECT name, avg(duration) AS avg_duration_s
FROM spans
WHERE start_time > now() - INTERVAL 1 DAY
GROUP BY name ORDER BY avg_duration_s DESC LIMIT 10
```

Error rate by span name:

```sql
SELECT name, countIf(status = 'error') AS errors, count(*) AS total,
       round(errors / total * 100, 2) AS error_rate
FROM spans
WHERE start_time > now() - INTERVAL 1 DAY
GROUP BY name HAVING total > 10 ORDER BY error_rate DESC
```

## curl example

```bash
curl -sS -X POST "${LMNR_BASE_URL:-https://api.lmnr.ai}/v1/sql/query" \
  -H "Authorization: Bearer $LMNR_PROJECT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"query":"SELECT name, input, output FROM spans WHERE start_time > now() - INTERVAL 1 DAY","parameters":{}}'
```
