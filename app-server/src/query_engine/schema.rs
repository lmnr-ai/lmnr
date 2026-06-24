//! Static SQL schema, the single source of truth surfaced to BOTH the Platform Agent's `query_sql`
//! system prompt (`agent::prompts`) and the MCP `query_laminar_sql` tool description (`api::v1::mcp`).
//! Lives here next to the validator allowlist (`validator::TableRegistry`) it must mirror — drift
//! between this list, the validator, and frontend `sql/utils.ts` (`tableSchemas`/`enumValues`) breaks
//! generation. The caller writes LOGICAL table names; the query engine rewrites them to
//! project-scoped `_v0(...)` views and injects `project_id`.

struct Column {
    name: &'static str,
    ty: &'static str,
    desc: &'static str,
}

struct Table {
    name: &'static str,
    desc: &'static str,
    columns: &'static [Column],
}

const fn col(name: &'static str, ty: &'static str, desc: &'static str) -> Column {
    Column { name, ty, desc }
}

/// Constrained columns and their allowed literals (mirrors `enumValues`); stops the model inventing values.
const ENUMS: &[(&str, &[&str])] = &[
    (
        "span_type",
        &[
            "DEFAULT",
            "LLM",
            "EXECUTOR",
            "EVALUATOR",
            "EVALUATION",
            "TOOL",
            "HUMAN_EVALUATOR",
            "CACHED",
            "UNKNOWN",
        ],
    ),
    ("trace_type", &["DEFAULT", "EVALUATION", "PLAYGROUND"]),
    ("status", &["success", "error"]),
    (
        "signal_run_status",
        &["PENDING", "COMPLETED", "FAILED", "UNKNOWN"],
    ),
    ("signal_run_mode", &["BATCH", "REALTIME", "UNKNOWN"]),
];

const TABLES: &[Table] = &[
    Table {
        name: "spans",
        desc: "Individual spans within traces: timing, tokens, costs, and LLM-specific data.",
        columns: &[
            col("span_id", "UUID", "Unique id of the span"),
            col("trace_id", "UUID", "Id of the trace this span belongs to"),
            col("parent_span_id", "UUID", "Id of the parent span"),
            col("name", "String", "Name of the span"),
            col("path", "String", "Hierarchical path, e.g. 'outer.inner'"),
            col(
                "span_type",
                "String (enum span_type)",
                "Span type, e.g. 'LLM', 'TOOL', 'DEFAULT'",
            ),
            col("status", "String (enum status)", "'success' or 'error'"),
            col("start_time", "DateTime64(9,'UTC')", "When the span started"),
            col("end_time", "DateTime64(9,'UTC')", "When the span ended"),
            col("duration", "Float64", "Duration in seconds"),
            col("input", "String", "Span input as stringified JSON"),
            col("output", "String", "Span output as stringified JSON"),
            col("request_model", "String", "LLM model requested"),
            col("response_model", "String", "LLM model in the response"),
            col("model", "String", "coalesce(request_model, response_model)"),
            col(
                "provider",
                "String",
                "LLM provider, e.g. 'openai', 'anthropic'",
            ),
            col("input_tokens", "UInt64", "Input tokens"),
            col("output_tokens", "UInt64", "Output tokens"),
            col("total_tokens", "UInt64", "Total tokens"),
            col("input_cost", "Float64", "Input cost"),
            col("output_cost", "Float64", "Output cost"),
            col("total_cost", "Float64", "Total cost"),
            col(
                "attributes",
                "String",
                "Span attributes as stringified JSON",
            ),
            col("tags", "Array(String)", "Span-level tags"),
            col(
                "tool_definitions",
                "String",
                "Tool definitions exposed to the LLM span as stringified JSON",
            ),
        ],
    },
    Table {
        name: "traces",
        desc: "Top-level trace records aggregating span data with session and user context. \
               Filter on start_time/end_time to bound the scan.",
        columns: &[
            col("id", "UUID", "Unique id of the trace"),
            col(
                "trace_type",
                "String (enum trace_type)",
                "'DEFAULT', 'EVALUATION', or 'PLAYGROUND'",
            ),
            col("metadata", "String", "Trace metadata as stringified JSON"),
            col(
                "start_time",
                "DateTime64(9,'UTC')",
                "When the trace started",
            ),
            col("end_time", "DateTime64(9,'UTC')", "When the trace ended"),
            col("duration", "Float64", "Duration in seconds"),
            col("input_tokens", "Int64", "Input tokens"),
            col("output_tokens", "Int64", "Output tokens"),
            col("total_tokens", "Int64", "Total tokens"),
            col(
                "cache_read_input_tokens",
                "Int64",
                "Tokens read from prompt cache",
            ),
            col(
                "cache_creation_input_tokens",
                "Int64",
                "Tokens written to prompt cache",
            ),
            col("reasoning_tokens", "Int64", "Reasoning tokens"),
            col("input_cost", "Float64", "Input cost"),
            col("output_cost", "Float64", "Output cost"),
            col("total_cost", "Float64", "Total cost"),
            col(
                "status",
                "String (enum status)",
                "'error' if any span errored, else 'success'",
            ),
            col("user_id", "String", "User id sent with the trace"),
            col("session_id", "String", "Session identifier"),
            col("top_span_id", "UUID", "Id of the top-level span"),
            col("top_span_name", "String", "Name of the top-level span"),
            col(
                "top_span_type",
                "String (enum span_type)",
                "Type of the top-level span",
            ),
            col(
                "tags",
                "Array(String)",
                "Union of span-level tags in the trace",
            ),
            col(
                "trace_tags",
                "Array(String)",
                "Tags applied directly to the trace",
            ),
            col(
                "span_names",
                "Array(String)",
                "De-duplicated span names in the trace",
            ),
            col(
                "root_span_input",
                "String",
                "Top span input as stringified JSON / raw string",
            ),
            col(
                "root_span_output",
                "String",
                "Top span output as stringified JSON / raw string",
            ),
        ],
    },
    Table {
        name: "evaluation_datapoints",
        desc: "Results from evaluations: scores, executor output, and denormalized trace data.",
        columns: &[
            col("id", "UUID", "Unique id of the evaluation datapoint"),
            col("evaluation_id", "UUID", "Id of the evaluation"),
            col("trace_id", "UUID", "Id of the associated trace"),
            col(
                "created_at",
                "DateTime64(9,'UTC')",
                "When the datapoint was created",
            ),
            col("data", "String", "Input data"),
            col("target", "String", "Target / expected output"),
            col("metadata", "String", "Metadata as stringified JSON"),
            col("executor_output", "String", "Executor output"),
            col("index", "UInt64", "Index within the evaluation"),
            col("group_id", "String", "Group id of the evaluation run"),
            col(
                "scores",
                "String",
                "Stringified JSON object: score name -> value",
            ),
            col("dataset_id", "UUID", "Linked dataset id (nil if none)"),
            col(
                "dataset_datapoint_id",
                "UUID",
                "Linked dataset datapoint id (nil if none)",
            ),
            col(
                "dataset_datapoint_created_at",
                "DateTime64(9,'UTC')",
                "When the linked dataset datapoint was created (unix epoch if none)",
            ),
            col(
                "duration",
                "Float64",
                "Duration in seconds from the associated trace",
            ),
            col(
                "total_cost",
                "Float64",
                "Total cost from the associated trace",
            ),
            col(
                "total_tokens",
                "Int64",
                "Total tokens from the associated trace",
            ),
            col(
                "trace_status",
                "String (enum status)",
                "Status of the associated trace",
            ),
        ],
    },
    Table {
        name: "dataset_datapoints",
        desc: "Data points in datasets with input data, targets, and metadata.",
        columns: &[
            col("id", "UUID", "Unique id"),
            col("created_at", "DateTime64(9,'UTC')", "When created"),
            col("dataset_id", "UUID", "Id of the dataset"),
            col("data", "String", "Input data"),
            col("target", "String", "Target / expected output"),
            col("metadata", "String", "Additional metadata"),
        ],
    },
    Table {
        name: "logs",
        desc: "Log entries with severity, body, and trace correlation.",
        columns: &[
            col("log_id", "UUID", "Unique id of the log"),
            col("time", "DateTime64(9,'UTC')", "When the log occurred"),
            col(
                "observed_time",
                "DateTime64(9,'UTC')",
                "When the log was observed",
            ),
            col("severity_number", "UInt8", "Numeric severity"),
            col("severity_text", "String", "Severity text"),
            col("body", "String", "Log body"),
            col("attributes", "String", "Attributes as stringified JSON"),
            col("trace_id", "UUID", "Id of the trace"),
            col("span_id", "UUID", "Id of the span"),
            col("flags", "UInt32", "Flags for the log"),
            col("event_name", "String", "Event name"),
        ],
    },
    Table {
        name: "signal_runs",
        desc: "Execution records for signals with status and error info.",
        columns: &[
            col("signal_id", "UUID", "Id of the signal"),
            col("job_id", "UUID", "Id of the job"),
            col("trigger_id", "UUID", "Id of the trigger"),
            col("run_id", "UUID", "Id of the run"),
            col("trace_id", "UUID", "Id of the trace"),
            col("status", "String (enum signal_run_status)", "Run status"),
            col(
                "mode",
                "String (enum signal_run_mode)",
                "'BATCH' (historical backfill) or 'REALTIME'",
            ),
            col("event_id", "UUID", "Id of the produced event"),
            col("error_message", "String", "Error message if the run failed"),
            col("updated_at", "DateTime64(9,'UTC')", "When last updated"),
        ],
    },
    Table {
        name: "signal_events",
        desc: "Events emitted by signals during execution. Excludes L0 clusters in `clusters`.",
        columns: &[
            col("id", "UUID", "Unique id of the signal event"),
            col("signal_id", "UUID", "Id of the signal"),
            col("trace_id", "UUID", "Id of the trace"),
            col("run_id", "UUID", "Id of the run"),
            col("name", "String", "Event name"),
            col("payload", "String", "Payload as stringified JSON"),
            col(
                "timestamp",
                "DateTime64(9,'UTC')",
                "When the event occurred",
            ),
            col("severity", "UInt8", "0 = INFO, 1 = WARNING, 2 = CRITICAL"),
            col(
                "summary",
                "String",
                "Short human-readable description (may be empty)",
            ),
            col(
                "clusters",
                "Array(UUID)",
                "Cluster ids this event belongs to (excludes L0)",
            ),
        ],
    },
    Table {
        name: "clusters",
        desc: "Hierarchy of clusters of similar signal events. Excludes L0 clusters. Use this when \
               the user asks about clusters / clustering / grouped signal events.",
        columns: &[
            col("id", "UUID", "Unique id of the cluster"),
            col(
                "signal_id",
                "UUID",
                "Id of the signal the cluster belongs to",
            ),
            col("name", "String", "Human-readable cluster name"),
            col("level", "UInt8", "Level in the hierarchy; higher = coarser"),
            col(
                "parent_id",
                "UUID",
                "Parent cluster id (nil UUID for top-level)",
            ),
            col(
                "num_signal_events",
                "UInt32",
                "Number of signal events in the cluster",
            ),
            col(
                "num_children_clusters",
                "UInt16",
                "Number of immediate child clusters",
            ),
            col("created_at", "DateTime64(9,'UTC')", "When created"),
            col("updated_at", "DateTime64(9,'UTC')", "When last updated"),
        ],
    },
    Table {
        name: "labeling_queue_items",
        desc: "Per-item rows of labeling queues.",
        columns: &[
            col("id", "UUID", "Unique id of the queue item"),
            col("queue_id", "UUID", "Id of the labeling queue"),
            col(
                "payload",
                "String",
                "Original seeded {data, target, metadata} as stringified JSON",
            ),
            col("metadata", "String", "Additional metadata"),
            col("status", "UInt8", "0 = unlabeled, 1 = approved"),
            col(
                "edit",
                "String",
                "Current canonical target as stringified JSON",
            ),
            col("created_at", "DateTime64(9,'UTC')", "When created"),
            col("updated_at", "DateTime64(9,'UTC')", "When last updated"),
        ],
    },
];

/// Render the full schema block (`<tables>…</tables><enums>…</enums>`). Compact, one line per column.
/// Embedded verbatim in both the agent system prompt and the MCP tool description.
pub fn build_schema_prompt() -> String {
    let mut out = String::new();
    out.push_str("<tables>\n");
    for table in TABLES {
        out.push_str(&format!("TABLE {} — {}\n", table.name, table.desc));
        for c in table.columns {
            out.push_str(&format!("  {} {} — {}\n", c.name, c.ty, c.desc));
        }
        out.push('\n');
    }
    out.push_str("</tables>\n<enums>\n");
    for (name, values) in ENUMS {
        let joined = values
            .iter()
            .map(|v| format!("'{v}'"))
            .collect::<Vec<_>>()
            .join(", ");
        out.push_str(&format!("{name}: {joined}\n"));
    }
    out.push_str("</enums>");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_prompt_lists_core_tables() {
        let p = build_schema_prompt();
        for table in [
            "spans",
            "traces",
            "evaluation_datapoints",
            "signal_events",
            "clusters",
            "signal_runs",
            "logs",
        ] {
            assert!(
                p.contains(&format!("TABLE {table} ")),
                "missing table {table}"
            );
        }
    }

    #[test]
    fn schema_prompt_surfaces_enum_values() {
        let p = build_schema_prompt();
        assert!(p.contains("span_type:"));
        assert!(p.contains("'LLM'"));
        assert!(p.contains("status:"));
        assert!(p.contains("'error'"));
    }

    #[test]
    fn every_table_has_columns() {
        for t in TABLES {
            assert!(!t.columns.is_empty(), "table {} has no columns", t.name);
        }
    }
}
