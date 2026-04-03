#!/usr/bin/env python3
"""
Trace Tags Benchmark: Approach 1 (no join) vs Approach 2 (separate table + JOIN).

Usage:
    export CLICKHOUSE_URL=https://...
    export CLICKHOUSE_USER=...
    export CLICKHOUSE_PASSWORD=...
    python3 benchmarks/trace_tags_benchmark.py

Requires a ClickHouse instance with:
- default.traces_replacing (with trace_tags column)
- default.traces_v0 parameterized view (approach 1, no join)
- default.trace_tags_array_rmt table (approach 2, separate table)
- default.traces_v0_join parameterized view (approach 2, with join)
"""
import urllib.request
import urllib.parse
import os
import json
import time
import sys


CH_URL = os.environ["CLICKHOUSE_URL"]
CH_USER = os.environ["CLICKHOUSE_USER"]
CH_PASS = os.environ["CLICKHOUSE_PASSWORD"]


def run_query_json(query: str) -> dict:
    params = {
        "user": CH_USER,
        "password": CH_PASS,
        "default_format": "JSON",
        "max_execution_time": "60",
    }
    url = f"{CH_URL}/?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, data=query.encode("utf-8"))
    start = time.perf_counter()
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read().decode("utf-8"))
    elapsed = time.perf_counter() - start
    stats = data.get("statistics", {})
    return {
        "rows_read": stats.get("rows_read", 0),
        "bytes_read": stats.get("bytes_read", 0),
        "ch_ms": stats.get("elapsed", 0) * 1000,
        "total_ms": elapsed * 1000,
        "result_rows": data.get("rows", 0),
    }


def run_query(query: str, data: str | None = None) -> str:
    params = {"user": CH_USER, "password": CH_PASS}
    if data:
        params["query"] = query
        body = data.encode("utf-8")
    else:
        body = query.encode("utf-8")
    url = f"{CH_URL}/?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, data=body)
    resp = urllib.request.urlopen(req)
    return resp.read().decode("utf-8")


def benchmark(project_id: str, runs: int = 3):
    # Find a trace with tags
    result = run_query_json(
        f"SELECT id FROM default.traces_replacing FINAL "
        f"WHERE project_id = '{project_id}' AND length(trace_tags) > 0 LIMIT 1"
    )
    if not result.get("data"):
        print("ERROR: No traces with trace_tags found")
        sys.exit(1)
    sample_id = result["data"][0]["id"]

    # Count total traces
    count_result = run_query_json(
        f"SELECT count() AS c FROM default.traces_replacing FINAL "
        f"WHERE project_id = '{project_id}'"
    )
    total = count_result["data"][0]["c"]
    print(f"Project: {project_id}")
    print(f"Total traces: {total}")
    print(f"Sample trace ID: {sample_id}")
    print(f"Runs per query: {runs}\n")

    queries = {
        "Single trace by ID": (
            f"SELECT * FROM default.traces_v0(project_id='{project_id}') WHERE id = '{sample_id}'",
            f"SELECT * FROM default.traces_v0_join(project_id='{project_id}') WHERE id = '{sample_id}'",
        ),
        "List 50 traces": (
            f"SELECT * FROM default.traces_v0(project_id='{project_id}') ORDER BY start_time DESC LIMIT 50",
            f"SELECT * FROM default.traces_v0_join(project_id='{project_id}') ORDER BY start_time DESC LIMIT 50",
        ),
        "List 100 traces": (
            f"SELECT * FROM default.traces_v0(project_id='{project_id}') ORDER BY start_time DESC LIMIT 100",
            f"SELECT * FROM default.traces_v0_join(project_id='{project_id}') ORDER BY start_time DESC LIMIT 100",
        ),
        "Filter tags=production": (
            f"SELECT * FROM default.traces_v0(project_id='{project_id}') WHERE has(tags, 'production') ORDER BY start_time DESC LIMIT 50",
            f"SELECT * FROM default.traces_v0_join(project_id='{project_id}') WHERE has(tags, 'production') ORDER BY start_time DESC LIMIT 50",
        ),
        "Filter 2 tags (AND)": (
            f"SELECT * FROM default.traces_v0(project_id='{project_id}') WHERE has(tags, 'production') AND has(tags, 'reviewed') ORDER BY start_time DESC LIMIT 50",
            f"SELECT * FROM default.traces_v0_join(project_id='{project_id}') WHERE has(tags, 'production') AND has(tags, 'reviewed') ORDER BY start_time DESC LIMIT 50",
        ),
        "Count per tag": (
            f"SELECT tag, count() AS cnt FROM default.traces_v0(project_id='{project_id}') ARRAY JOIN tags AS tag GROUP BY tag ORDER BY cnt DESC",
            f"SELECT tag, count() AS cnt FROM default.traces_v0_join(project_id='{project_id}') ARRAY JOIN tags AS tag GROUP BY tag ORDER BY cnt DESC",
        ),
        "Aggregate": (
            f"SELECT count(), sum(total_tokens), avg(duration) FROM default.traces_v0(project_id='{project_id}')",
            f"SELECT count(), sum(total_tokens), avg(duration) FROM default.traces_v0_join(project_id='{project_id}')",
        ),
    }

    header = f"{'Query':<25} | {'Approach':<8} | {'CH ms':>8} | {'Rows read':>10} | {'Bytes read':>12} | {'Result':>6}"
    print(header)
    print("-" * len(header))

    for name, (q_nojoin, q_join) in queries.items():
        best_a1 = None
        best_a2 = None
        for _ in range(runs):
            r1 = run_query_json(q_nojoin)
            r2 = run_query_json(q_join)
            if best_a1 is None or r1["ch_ms"] < best_a1["ch_ms"]:
                best_a1 = r1
            if best_a2 is None or r2["ch_ms"] < best_a2["ch_ms"]:
                best_a2 = r2

        print(
            f"{name:<25} | {'NoJoin':<8} | {best_a1['ch_ms']:>7.1f} | {best_a1['rows_read']:>10,} | {best_a1['bytes_read']:>10,} B | {best_a1['result_rows']:>6}"
        )
        print(
            f"{'':25} | {'JOIN':<8} | {best_a2['ch_ms']:>7.1f} | {best_a2['rows_read']:>10,} | {best_a2['bytes_read']:>10,} B | {best_a2['result_rows']:>6}"
        )

        ratio_rows = best_a2["rows_read"] / max(best_a1["rows_read"], 1)
        ratio_bytes = best_a2["bytes_read"] / max(best_a1["bytes_read"], 1)
        ratio_ch = best_a2["ch_ms"] / max(best_a1["ch_ms"], 0.01)
        print(
            f"{'':25} | {'Ratio':<8} | {ratio_ch:>6.2f}x | {ratio_rows:>9.2f}x | {ratio_bytes:>9.2f}x   | "
        )
        print("-" * len(header))


if __name__ == "__main__":
    project_id = sys.argv[1] if len(sys.argv) > 1 else "0cce3ee3-d6bb-437d-a2fa-bbfd72a935e2"
    benchmark(project_id)
