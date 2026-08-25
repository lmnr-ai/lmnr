//! Static SQL schema, the single source of truth surfaced to BOTH the Platform Agent's `query_sql`
//! system prompt (`agent::prompts`) and the MCP `query_laminar_sql` tool description (`api::v1::mcp`).
//! Lives here next to the validator allowlist (`validator::TableRegistry`) it must mirror — drift
//! between this list, the validator, and frontend `sql/utils.ts` (`tableSchemas`/`enumValues`) breaks
//! generation. The caller writes LOGICAL table names; the query engine rewrites them to
//! project-scoped `_v0(...)` views and injects `project_id`.

#[derive(serde::Serialize)]
pub struct Column {
    pub name: &'static str,
    #[serde(rename = "type")]
    pub ty: &'static str,
    pub description: &'static str,
}

#[derive(serde::Serialize)]
pub struct Table {
    pub name: &'static str,
    pub description: &'static str,
    pub columns: &'static [Column],
}

/// A constrained column and the literals it accepts.
#[derive(serde::Serialize)]
pub struct EnumDef {
    pub name: &'static str,
    pub values: &'static [&'static str],
}

/// Wire shape of `GET /v1/sql/schema` (and its `/v1/cli` twin). Serialized
/// straight from the `TABLES` / `ENUMS` consts below, so the endpoint, the MCP
/// tool description, and the agent prompt cannot disagree.
#[derive(serde::Serialize)]
pub struct SqlSchema {
    pub tables: &'static [Table],
    pub enums: Vec<EnumDef>,
}

const fn col(name: &'static str, ty: &'static str, description: &'static str) -> Column {
    Column {
        name,
        ty,
        description,
    }
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

/// Every column holding a big stringified payload ends its description with the same sentence:
/// "— LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped". The agent picks
/// its SELECT list while reading these lines, so the warning has to sit here and not only in the
/// tool doc: annotating them cut raw payload selects from 146 to 18 of 323 replayed production
/// turns, and lifted the compile rate from 0.920 to 0.972. The sentence is written out at each
/// column rather than factored into a helper, so a reader of any one line sees what the agent sees;
/// `payload_columns_carry_the_large_warning` below fails if a column stops carrying it.
const TABLES: &[Table] = &[
    Table {
        name: "spans",
        description: "Individual spans within traces: timing, tokens, costs, and LLM-specific data.",
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
            col("duration", "Decimal(18,9)", "Duration in seconds"),
            col(
                "input",
                "String",
                "Span input as stringified JSON — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col(
                "output",
                "String",
                "Span output as stringified JSON — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col("request_model", "String", "LLM model requested"),
            col("response_model", "String", "LLM model in the response"),
            col("model", "String", "coalesce(request_model, response_model)"),
            col(
                "provider",
                "String",
                "LLM provider, e.g. 'openai', 'anthropic'",
            ),
            col("input_tokens", "Int64", "Input tokens"),
            col("output_tokens", "Int64", "Output tokens"),
            col("total_tokens", "Int64", "Total tokens"),
            col("input_cost", "Float64", "Input cost"),
            col("output_cost", "Float64", "Output cost"),
            col("total_cost", "Float64", "Total cost"),
            col(
                "attributes",
                "String",
                "Span attributes as stringified JSON — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col("tags", "Array(String)", "Span-level tags"),
            col(
                "tool_definitions",
                "String",
                "Tool definitions exposed to the LLM span as stringified JSON — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col(
                "events",
                "Array(Tuple(timestamp Int64, name String, attributes String))",
                "Span events; timestamp is unix nanoseconds, attributes is stringified JSON",
            ),
        ],
    },
    Table {
        name: "traces",
        description: "Top-level trace records aggregating span data with session and user context. \
               Filter on start_time/end_time to bound the scan.",
        columns: &[
            col("id", "UUID", "Unique id of the trace"),
            col(
                "trace_type",
                "String (enum trace_type)",
                "'DEFAULT', 'EVALUATION', or 'PLAYGROUND'",
            ),
            col(
                "metadata",
                "String",
                "Trace metadata as stringified JSON — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
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
                "UInt64",
                "Tokens read from prompt cache",
            ),
            col(
                "cache_creation_input_tokens",
                "UInt64",
                "Tokens written to prompt cache",
            ),
            col("reasoning_tokens", "UInt64", "Reasoning tokens"),
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
                "agent_input",
                "String",
                "Extracted agent task / user input for the trace (stringified JSON / raw string) — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col(
                "has_browser_session",
                "Bool",
                "Whether the trace has a recorded browser session",
            ),
        ],
    },
    Table {
        name: "trace_outputs",
        description: "Extracted final agent output per trace: the output-message array of the \
               last LLM call on the trace's main-agent path.",
        columns: &[
            col("trace_id", "UUID", "Id of the trace"),
            col(
                "start_time",
                "DateTime64(9,'UTC')",
                "Start time of the trace this output belongs to",
            ),
            col(
                "agent_output",
                "Array(String)",
                "Output messages of the trace's final LLM call, one stringified JSON message per element",
            ),
        ],
    },
    Table {
        name: "evaluation_datapoints",
        description: "Results from evaluations: scores, executor output, and denormalized trace data.",
        columns: &[
            col("id", "UUID", "Unique id of the evaluation datapoint"),
            col("evaluation_id", "UUID", "Id of the evaluation"),
            col("trace_id", "UUID", "Id of the associated trace"),
            col(
                "created_at",
                "DateTime64(9,'UTC')",
                "When the datapoint was created",
            ),
            col(
                "data",
                "String",
                "Input data — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col(
                "target",
                "String",
                "Target / expected output — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col(
                "metadata",
                "String",
                "Metadata as stringified JSON — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col(
                "executor_output",
                "String",
                "Executor output — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col("index", "UInt64", "Index within the evaluation"),
            col("group_id", "String", "Group id of the evaluation run"),
            col(
                "scores",
                "String",
                "Stringified JSON object: score name -> value — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
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
                "updated_at",
                "DateTime64(9,'UTC')",
                "When the datapoint was last updated",
            ),
            // Everything below is denormalized from the associated trace; all
            // are nil/empty/zero when the datapoint has no trace.
            col(
                "duration",
                "Decimal(18,9)",
                "Duration in seconds from the associated trace",
            ),
            col(
                "start_time",
                "DateTime64(9,'UTC')",
                "Start time of the associated trace",
            ),
            col(
                "end_time",
                "DateTime64(9,'UTC')",
                "End time of the associated trace",
            ),
            col("input_cost", "Float64", "Input cost from the trace"),
            col("output_cost", "Float64", "Output cost from the trace"),
            col(
                "total_cost",
                "Float64",
                "Total cost from the associated trace",
            ),
            col("input_tokens", "Int64", "Input tokens from the trace"),
            col("output_tokens", "Int64", "Output tokens from the trace"),
            col(
                "total_tokens",
                "Int64",
                "Total tokens from the associated trace",
            ),
            col(
                "trace_status",
                "LowCardinality(String) (enum status)",
                "Status of the associated trace",
            ),
            col(
                "trace_metadata",
                "String",
                "Metadata of the associated trace as stringified JSON — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col(
                "trace_tags",
                "Array(String)",
                "Tags of the associated trace",
            ),
            col(
                "top_span_id",
                "UUID",
                "Id of the top-level span of the associated trace",
            ),
            col(
                "trace_spans",
                "Array(Tuple(name String, duration Float64, type String))",
                "Spans of the associated trace; `type` is the numeric span type as a string",
            ),
        ],
    },
    Table {
        name: "dataset_datapoints",
        description: "Data points in datasets with input data, targets, and metadata.",
        columns: &[
            col("id", "UUID", "Unique id"),
            col("created_at", "DateTime64(9,'UTC')", "When created"),
            col("dataset_id", "UUID", "Id of the dataset"),
            col(
                "data",
                "String",
                "Input data — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col(
                "target",
                "String",
                "Target / expected output — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col(
                "metadata",
                "String",
                "Additional metadata — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
        ],
    },
    Table {
        name: "dataset_datapoint_versions",
        description: "Same columns as dataset_datapoints, but every version of each datapoint \
               rather than only the latest.",
        columns: &[
            col("id", "UUID", "Unique id"),
            col("created_at", "DateTime64(9,'UTC')", "When created"),
            col("dataset_id", "UUID", "Id of the dataset"),
            col(
                "data",
                "String",
                "Input data — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col(
                "target",
                "String",
                "Target / expected output — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col(
                "metadata",
                "String",
                "Additional metadata — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
        ],
    },
    Table {
        name: "logs",
        description: "Log entries with severity, body, and trace correlation.",
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
            col(
                "body",
                "String",
                "Log body — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col(
                "attributes",
                "String",
                "Attributes as stringified JSON — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col("trace_id", "UUID", "Id of the trace"),
            col("span_id", "UUID", "Id of the span"),
            col("flags", "UInt32", "Flags for the log"),
            col("event_name", "String", "Event name"),
        ],
    },
    Table {
        name: "signal_runs",
        description: "Execution records for signals with status and error info.",
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
            col(
                "input_tokens",
                "UInt32",
                "Input tokens spent evaluating the signal",
            ),
            col(
                "cache_read_tokens",
                "UInt32",
                "Cached input tokens read (a subset of input_tokens)",
            ),
            col(
                "output_tokens",
                "UInt32",
                "Output tokens produced by the signal agent",
            ),
        ],
    },
    Table {
        name: "signal_events",
        description: "Events emitted by signals during execution. Excludes L0 clusters in `clusters`.",
        columns: &[
            col("id", "UUID", "Unique id of the signal event"),
            col("signal_id", "UUID", "Id of the signal"),
            col("trace_id", "UUID", "Id of the trace"),
            col("run_id", "UUID", "Id of the run"),
            col("name", "String", "Event name"),
            col(
                "payload",
                "String",
                "Payload as stringified JSON — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
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
        description: "Hierarchy of clusters of similar signal events. Excludes L0 clusters. Use this when \
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
                "Number of clustered event summaries in the cluster (an event contributes once per summary)",
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
        description: "Per-item rows of labeling queues.",
        columns: &[
            col("id", "UUID", "Unique id of the queue item"),
            col("queue_id", "UUID", "Id of the labeling queue"),
            col(
                "payload",
                "String",
                "Original seeded {data, target, metadata} as stringified JSON — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col(
                "metadata",
                "String",
                "Additional metadata — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            col("status", "UInt8", "0 = unlabeled, 1 = approved"),
            col(
                "edit",
                "String",
                "Current canonical target as stringified JSON — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped",
            ),
            // Millisecond precision here, unlike every other table's nanoseconds.
            col("created_at", "DateTime64(3,'UTC')", "When created"),
            col("updated_at", "DateTime64(3,'UTC')", "When last updated"),
        ],
    },
];

/// The same table/column/enum data as `build_schema_prompt`, in a structured form.
/// Served by `GET /v1/sql/schema` so `lmnr-cli sql schema` renders live server truth
/// instead of a hand-maintained copy that drifts (it did — see lmnr-ai/lmnr-ts#291).
pub fn schema_payload() -> SqlSchema {
    SqlSchema {
        tables: TABLES,
        enums: ENUMS
            .iter()
            .map(|&(name, values)| EnumDef { name, values })
            .collect(),
    }
}

/// Render the full schema block (`<tables>…</tables><enums>…</enums>`). Compact, one line per column.
/// Embedded verbatim in both the agent system prompt and the MCP tool description.
pub fn build_schema_prompt() -> String {
    let mut out = String::new();
    out.push_str("<tables>\n");
    for table in TABLES {
        out.push_str(&format!("TABLE {} — {}\n", table.name, table.description));
        for c in table.columns {
            out.push_str(&format!("  {} {} — {}\n", c.name, c.ty, c.description));
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

    /// The row-drop warning must reach the model on the column lines themselves — that is where the
    /// measured win came from, not from the tool doc alone.
    #[test]
    fn payload_columns_carry_the_large_warning() {
        let p = build_schema_prompt();
        for line_start in [
            "  input String —",
            "  output String —",
            "  attributes String —",
            "  metadata String —",
            "  agent_input String —",
            "  executor_output String —",
            "  body String —",
        ] {
            let line = p
                .lines()
                .find(|l| l.starts_with(line_start))
                .unwrap_or_else(|| panic!("no column line starting with {line_start:?}"));
            assert!(
                line.contains("LARGE: select as substring(col, 1, 2000)"),
                "payload column missing the LARGE warning: {line}"
            );
        }
        // Small scalar columns stay unannotated — the warning only works if it is rare.
        assert!(!p.contains("  name String — Name of the span — LARGE"));
    }

    /// The warning is written out at each payload column instead of coming from a helper, so this
    /// checks the copies have not drifted: every annotated column carries the sentence verbatim,
    /// and the number of annotated columns is the number we measured.
    #[test]
    fn the_large_warning_is_identical_on_every_payload_column() {
        const NOTE: &str =
            " — LARGE: select as substring(col, 1, 2000), never raw, or the row is dropped";
        let annotated: Vec<&Column> = TABLES
            .iter()
            .flat_map(|t| t.columns.iter())
            .filter(|c| c.description.contains("LARGE"))
            .collect();
        assert_eq!(annotated.len(), 24, "payload column count changed");
        for c in annotated {
            assert!(
                c.description.ends_with(NOTE),
                "column {} does not end with the exact warning: {}",
                c.name,
                c.description
            );
        }
    }

    #[test]
    fn every_table_has_columns() {
        for t in TABLES {
            assert!(!t.columns.is_empty(), "table {} has no columns", t.name);
        }
    }

    /// The endpoint payload and the prompt block are two renderings of one
    /// source. If this drifts, `lmnr-cli sql schema` and the MCP tool
    /// description start disagreeing again.
    #[test]
    fn schema_payload_matches_the_prompt_tables() {
        let payload = schema_payload();
        let prompt = build_schema_prompt();

        assert_eq!(payload.tables.len(), TABLES.len());
        assert_eq!(payload.enums.len(), ENUMS.len());

        for t in payload.tables {
            assert!(
                prompt.contains(&format!("TABLE {} ", t.name)),
                "table {} is in the payload but not the prompt",
                t.name
            );
        }
    }

    #[test]
    fn schema_payload_serializes_with_renamed_fields() {
        let json = serde_json::to_value(schema_payload()).expect("payload serializes");

        let spans = json["tables"]
            .as_array()
            .expect("tables is an array")
            .iter()
            .find(|t| t["name"] == "spans")
            .expect("spans table is present");

        let col = spans["columns"]
            .as_array()
            .expect("columns is an array")
            .first()
            .expect("spans has columns");
        assert!(col["type"].is_string(), "column exposes `type`, not `ty`");
        assert!(
            col["description"].is_string(),
            "column exposes `description`, not `desc`"
        );

        let enums = json["enums"].as_array().expect("enums is an array");
        assert!(
            enums.iter().any(|e| e["name"] == "span_type"),
            "span_type enum is present"
        );
    }
}
