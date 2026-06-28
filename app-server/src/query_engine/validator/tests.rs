//! Port of `query-engine/tests/test_validation.py`.
//!
//! Per the porting contract we match tested *functionality* 1:1 but drop
//! exact-whitespace assertions: every `assert "..." in result` becomes a
//! whitespace-collapsed substring check via [`contains_ws`]. The Python tests
//! relied on sqlglot's pretty-printer producing specific newline/indent
//! layouts; sqlparser's `Display` differs, so we normalise both sides to
//! single-spaced tokens before comparing.

use super::*;

const SAMPLE_PROJECT_ID: &str = "test-project-123";

/// Collapse all runs of ASCII whitespace to a single space and trim, so a
/// substring assertion is insensitive to the formatter's line breaks / indent.
fn norm(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Whitespace-agnostic `needle in haystack`.
fn contains_ws(haystack: &str, needle: &str) -> bool {
    norm(haystack).contains(&norm(needle))
}

fn validate(query: &str) -> Result<String, String> {
    QueryValidator::new().validate_and_secure_query(query, SAMPLE_PROJECT_ID)
}

fn validate_ok(query: &str) -> String {
    validate(query)
        .unwrap_or_else(|e| panic!("expected query to validate, got error: {e}\nquery: {query}"))
}

// ----------------------------------------------------------------------------
// TestTableRegistry
// ----------------------------------------------------------------------------

#[test]
fn test_default_tables_registered() {
    let reg = TableRegistry::new();
    assert!(reg.is_table_allowed("spans"));
    assert!(reg.is_table_allowed("traces"));
    assert!(reg.is_table_allowed("evaluation_datapoints"));

    assert!(!reg.is_table_allowed("unknown_table"));
    assert!(!reg.is_table_allowed("traces_v0"));
    assert!(!reg.is_table_allowed("spans_v0"));
    assert!(!reg.is_table_allowed("evaluation_datapoints_v0"));
}

#[test]
fn test_spans_table_schema() {
    let reg = TableRegistry::new();
    let spans = reg.get_table_schema("spans").expect("spans schema");
    assert!(spans.allowed_columns.contains("span_id"));
    assert!(spans.allowed_columns.contains("start_time"));
}

#[test]
fn test_traces_table_schema() {
    let reg = TableRegistry::new();
    let traces = reg.get_table_schema("traces").expect("traces schema");
    assert!(traces.allowed_columns.contains("id"));
    assert!(traces.allowed_columns.contains("start_time"));
}

#[test]
fn test_column_validation() {
    let reg = TableRegistry::new();
    let spans = reg.get_table_schema("spans").expect("spans schema");
    assert!(spans.is_column_allowed("span_id"));
    assert!(spans.is_column_allowed("SPAN_ID")); // case insensitive
    assert!(!spans.is_column_allowed("invalid_column"));
}

// ----------------------------------------------------------------------------
// TestQueryValidator
// ----------------------------------------------------------------------------

#[test]
fn test_validate_basic_spans_select() {
    let result = validate_ok("SELECT span_id, name FROM spans");
    assert!(
        contains_ws(
            &result,
            &format!("FROM spans_v0(project_id = '{SAMPLE_PROJECT_ID}')")
        ),
        "got: {result}"
    );
}

#[test]
fn test_validate_basic_traces_select() {
    let result = validate_ok("SELECT trace_id, start_time FROM traces");
    assert!(
        contains_ws(
            &result,
            &format!("FROM traces_v0(project_id = '{SAMPLE_PROJECT_ID}') AS traces")
        ),
        "got: {result}"
    );
}

#[test]
fn test_validate_evaluation_datapoints_select() {
    let result = validate_ok("SELECT id, evaluation_id FROM evaluation_datapoints");
    assert!(
        contains_ws(
            &result,
            &format!(
                "FROM evaluation_datapoints_v0(project_id = '{SAMPLE_PROJECT_ID}') AS evaluation_datapoints"
            )
        ),
        "got: {result}"
    );
}

#[test]
fn test_reject_write_operations() {
    // Write operations sqlparser parses as a non-Query statement: rejected by
    // the SELECT-only security gate with the canonical message.
    let select_only_rejected = [
        "INSERT INTO spans VALUES (1, 'test')",
        "UPDATE spans SET span_name = 'test'",
        "DELETE FROM spans WHERE span_id = 'test'",
        "DROP TABLE spans",
        "TRUNCATE TABLE spans",
        "ALTER TABLE spans DROP COLUMN span_name",
        "ALTER TABLE spans RENAME COLUMN span_name TO new_name",
        "ALTER TABLE spans ADD COLUMN new_column INT",
        "UPDATE spans SET span_name = 'test' WHERE 1=1",
    ];
    for query in select_only_rejected {
        let err = validate(query).expect_err(&format!("expected rejection for: {query}"));
        assert!(
            err.contains("Only SELECT statements are allowed"),
            "query {query} gave wrong error: {err}"
        );
    }

    // ClickHouse mutation syntax (`ALTER TABLE ... DELETE/UPDATE`) is not part
    // of sqlparser's ClickHouse grammar, so it's rejected at parse time rather
    // than by the SELECT-only gate. Either way the write op never validates —
    // that is the security property the Python test asserted.
    let parse_rejected = [
        "ALTER TABLE spans DELETE WHERE 1=1",
        "ALTER TABLE spans UPDATE span_name = 'test' WHERE 1=1",
    ];
    for query in parse_rejected {
        assert!(
            validate(query).is_err(),
            "write op should be rejected: {query}"
        );
    }
}

#[test]
fn test_reject_unknown_table() {
    let err = validate("SELECT * FROM unknown_table").expect_err("should reject unknown table");
    assert!(err.contains("not allowed"), "got: {err}");
}

#[test]
fn test_reject_non_select() {
    let err = validate("SHOW TABLES").expect_err("should reject SHOW TABLES");
    assert!(
        err.contains("Only SELECT statements are allowed"),
        "got: {err}"
    );
}

#[test]
fn test_reject_ch_system_tables() {
    let err = validate("SELECT * FROM system.users").expect_err("should reject system.users");
    assert!(err.contains("not allowed"), "got: {err}");
}

#[test]
fn test_reject_dangerous_functions() {
    let dangerous_queries = [
        "SELECT url('http://attacker.com') FROM spans",
        "SELECT file('/etc/passwd') FROM spans",
        "SELECT * FROM remote('attacker.com', 'db', 'table')",
        "SELECT * FROM remoteSecure('attacker.com', 'db', 'table')",
        "SELECT * FROM s3('http://bucket/key')",
        "SELECT * FROM mysql('host', 'db', 'table', 'user', 'pass')",
        "SELECT * FROM postgresql('host', 'db', 'table', 'user', 'pass')",
    ];

    for query in dangerous_queries {
        let err = validate(query).expect_err(&format!("expected rejection for: {query}"));
        assert!(err.contains("not allowed"), "query {query} gave: {err}");
    }
}

#[test]
fn test_allow_safe_functions() {
    let safe_queries = [
        "SELECT countIf(status = 'ERROR') FROM spans",
        "SELECT sum(total_cost) FROM spans",
        "SELECT toStartOfInterval(start_time, INTERVAL 5 MINUTE) AS t FROM spans",
        "SELECT quantile(0.9)(duration) FROM spans",
    ];

    for query in safe_queries {
        validate(query).unwrap_or_else(|e| panic!("safe query rejected: {query}\nerror: {e}"));
    }
}

#[test]
fn test_reject_project_id_access() {
    let err = validate("SELECT span_id, project_id FROM spans")
        .expect_err("should reject project_id access");
    assert!(
        err.contains("Column 'project_id' does not exist"),
        "got: {err}"
    );
}

#[test]
fn test_reject_project_id_access_in_filter() {
    let err = validate(
        "SELECT span_id FROM spans WHERE project_id = '01234567-89ab-4def-8123-456789abcdef'",
    )
    .expect_err("should reject project_id access");
    assert!(
        err.contains("Column 'project_id' does not exist"),
        "got: {err}"
    );
}

#[test]
fn test_reject_invalid_column() {
    let err = validate("SELECT spans.invalid_column FROM spans")
        .expect_err("should reject invalid column");
    assert!(
        err.contains("Column 'invalid_column' does not exist"),
        "got: {err}"
    );
}

#[test]
fn test_cte_with_spans() {
    let query = r#"
        WITH span_stats AS (
            SELECT span_id, COUNT(*) as count
            FROM spans
            GROUP BY span_id
        )
        SELECT * FROM span_stats
        "#;
    let result = validate_ok(query);
    assert!(
        contains_ws(
            &result,
            &format!("FROM spans_v0(project_id = '{SAMPLE_PROJECT_ID}') AS spans")
        ),
        "got: {result}"
    );
    assert!(contains_ws(&result, "FROM span_stats"), "got: {result}");
}

#[test]
fn test_subquery_with_spans() {
    let query = r#"
        SELECT * FROM (
            SELECT span_id, COUNT(*) as count
            FROM spans
            GROUP BY span_id
        ) span_stats
        "#;
    let result = validate_ok(query);
    assert!(
        contains_ws(
            &result,
            &format!("FROM spans_v0(project_id = '{SAMPLE_PROJECT_ID}') AS spans")
        ),
        "got: {result}"
    );
    assert!(
        contains_ws(&result, "AS span_stats") || contains_ws(&result, ") span_stats"),
        "got: {result}"
    );
}

#[test]
fn test_join_with_allowed_tables() {
    let query = r#"
        SELECT s.span_id, t.trace_id
        FROM spans s
        JOIN traces t ON s.trace_id = t.trace_id
        "#;
    let result = validate_ok(query);
    assert!(
        contains_ws(
            &result,
            &format!("FROM spans_v0(project_id = '{SAMPLE_PROJECT_ID}') AS s")
        ),
        "got: {result}"
    );
    assert!(
        contains_ws(
            &result,
            &format!("JOIN traces_v0(project_id = '{SAMPLE_PROJECT_ID}') AS t")
        ),
        "got: {result}"
    );
}

#[test]
fn test_complex_nested_query() {
    let query = r#"
        SELECT s1.span_id, s1.start_time
        FROM spans s1
        WHERE s1.trace_id IN (
            SELECT trace_id
            FROM spans s2
            WHERE s2.name = 'test'
        )
        "#;
    let result = validate_ok(query);
    let spans_v0_count = result.matches("spans_v0").count();
    assert!(
        spans_v0_count >= 2,
        "expected >=2 spans_v0, got {spans_v0_count} in: {result}"
    );
    let project_filter_count = result
        .matches(&format!("project_id = '{SAMPLE_PROJECT_ID}'"))
        .count();
    assert!(
        project_filter_count >= 2,
        "expected >=2 project filters, got {project_filter_count} in: {result}"
    );
}

// ----------------------------------------------------------------------------
// TestExpectedQueryTransformations
// ----------------------------------------------------------------------------

#[test]
fn test_basic_spans_query_transformation() {
    let result = validate_ok("SELECT span_id, name FROM spans");
    assert!(
        contains_ws(
            &result,
            &format!("spans_v0(project_id = '{SAMPLE_PROJECT_ID}') AS spans")
        ),
        "got: {result}"
    );
    assert!(
        contains_ws(&result, "SELECT span_id, name FROM"),
        "got: {result}"
    );
}

#[test]
fn test_spans_with_where_clause() {
    let result = validate_ok("SELECT span_id FROM spans WHERE name = 'test_span'");
    assert!(
        contains_ws(
            &result,
            &format!("spans_v0(project_id = '{SAMPLE_PROJECT_ID}') AS spans")
        ),
        "got: {result}"
    );
    assert!(
        contains_ws(&result, "WHERE name = 'test_span'"),
        "got: {result}"
    );
}

#[test]
fn test_spans_with_order_by_and_limit() {
    let result = validate_ok("SELECT span_id FROM spans ORDER BY start_time DESC LIMIT 10");
    assert!(
        contains_ws(
            &result,
            &format!("spans_v0(project_id = '{SAMPLE_PROJECT_ID}') AS spans")
        ),
        "got: {result}"
    );
    assert!(
        contains_ws(&result, "ORDER BY start_time DESC"),
        "got: {result}"
    );
    assert!(contains_ws(&result, "LIMIT 10"), "got: {result}");
}

#[test]
fn test_spans_time_range_query() {
    // Time filters on spans must NOT be pushed into a view function (only
    // traces gets time bounds); the WHERE clause stays intact on the query.
    // Fixture adapted from sqlglot's `interval '1 hour'` to the equivalent
    // `INTERVAL 1 HOUR` that sqlparser's ClickHouse dialect parses — same
    // functionality (interval predicate stays in the WHERE, not pushed to a
    // view function).
    let result = validate_ok(
        "SELECT start_time FROM spans WHERE start_time > now() - INTERVAL 1 HOUR LIMIT 1",
    );
    assert!(
        contains_ws(
            &result,
            &format!(
                "SELECT start_time FROM spans_v0(project_id = '{SAMPLE_PROJECT_ID}') AS spans"
            )
        ),
        "got: {result}"
    );
    // The interval predicate is preserved on the query (not lifted into the view fn).
    let after_from = result.split("spans_v0").last().unwrap_or("");
    assert!(
        contains_ws(after_from, "start_time > now() - INTERVAL 1 HOUR"),
        "interval predicate missing in: {result}"
    );
    assert!(contains_ws(&result, "LIMIT 1"), "got: {result}");
}

#[test]
fn test_traces_time_range_query() {
    let result = validate_ok(
        "SELECT trace_id, duration FROM traces WHERE start_time >= '2024-01-01' AND end_time <= '2024-01-02'",
    );
    assert!(
        contains_ws(
            &result,
            &format!("traces_v0(project_id = '{SAMPLE_PROJECT_ID}') AS traces")
        ),
        "got: {result}"
    );
}

#[test]
fn test_traces_time_range_query_between() {
    let result = validate_ok(
        "SELECT trace_id, duration FROM traces WHERE start_time BETWEEN '2024-01-01' AND '2024-01-02'",
    );
    assert!(
        contains_ws(
            &result,
            &format!("traces_v0(project_id = '{SAMPLE_PROJECT_ID}') AS traces")
        ),
        "got: {result}"
    );
}

#[test]
fn test_multiple_tables_in_join() {
    let query = r#"
        SELECT s.span_id, t.duration, e.name as event_name
        FROM spans s
        JOIN traces t ON s.trace_id = t.trace_id
        LEFT JOIN signal_events se ON s.span_id = se.span_id
        "#;
    let result = validate_ok(query);
    assert!(
        contains_ws(
            &result,
            &format!("spans_v0(project_id = '{SAMPLE_PROJECT_ID}') AS s")
        ),
        "got: {result}"
    );
    assert!(
        contains_ws(
            &result,
            &format!("traces_v0(project_id = '{SAMPLE_PROJECT_ID}') AS t")
        ),
        "got: {result}"
    );
    assert!(
        contains_ws(
            &result,
            &format!("signal_events_v0(project_id = '{SAMPLE_PROJECT_ID}') AS se")
        ),
        "got: {result}"
    );
}

#[test]
fn test_query_parameters_intact() {
    let query = r#"
SELECT
    name,
    COUNT(span_id) AS value
FROM spans
WHERE
    start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY name
ORDER BY value DESC
LIMIT 5
"#;
    let result = validate_ok(query);
    assert!(
        contains_ws(
            &result,
            "WHERE start_time >= {start_time: DateTime64} AND start_time <= {end_time: DateTime64}"
        ),
        "got: {result}"
    );
}

#[test]
fn test_query_parameters_complex_query_parameters_intact() {
    let query = r#"
SELECT
    toStartOfInterval(start_time, INTERVAL 5 MINUTE) AS time,
    model,
    quantile(0.9)(end_time - start_time) AS value
FROM spans
WHERE
    model != '<null>'
    AND span_type IN (0, 1)
    AND start_time >= {start_time:DateTime64}
    AND start_time <= {end_time:DateTime64}
GROUP BY time, model
ORDER BY time
WITH FILL
FROM (
    toStartOfInterval({start_time:DateTime64}, INTERVAL 5 MINUTE)
)
TO (
    toStartOfInterval({start_time:DateTime64}, INTERVAL 5 MINUTE)
)
STEP INTERVAL 5 MINUTE
"#;
    let result = validate_ok(query);
    assert!(
        contains_ws(
            &result,
            "WHERE model <> '<null>' AND span_type IN (0, 1) AND start_time >= {start_time: DateTime64} AND start_time <= {end_time: DateTime64}"
        ),
        "got: {result}"
    );
    assert!(
        contains_ws(
            &result,
            "WITH FILL FROM (toStartOfInterval({start_time: DateTime64}, INTERVAL 5 MINUTE)) TO (toStartOfInterval({start_time: DateTime64}, INTERVAL 5 MINUTE))"
        ),
        "got: {result}"
    );
}

#[test]
fn test_cte_join_traces_and_spans_group_by_user_id() {
    let query = r#"
WITH
  trace_pivot AS (
    SELECT
      toString(user_id) AS user_id,
      sum(end_time - start_time) AS total_duration
    FROM traces
    WHERE
      start_time >= toDateTime('2025-08-06 00:00:00')
      AND start_time <  toDateTime('2025-08-09 00:00:00')
    group by user_id
  ),
  spans_pivot AS (
    SELECT
      toString(user_id) AS user_id,
      sumIf((end_time - start_time),
            name IN ('llm_api_handler','llm_api_handler_with_router_and_fallback')) AS llm_duration,
      sumIf((end_time - start_time),
            name = 'scrape_website') AS scrape_duration,
      sumIf((end_time - start_time),
            name = 'take_scrolling_screenshot') AS screenshot_duration
    FROM spans
    WHERE start_time >= toDateTime('2025-08-06 00:00:00')
      AND start_time <  toDateTime('2025-08-09 00:00:00')
    group by user_id
  )
SELECT
  *
FROM trace_pivot
LEFT JOIN spans_pivot USING (user_id)
"#;
    let result = validate_ok(query);

    assert!(
        contains_ws(
            &result,
            &format!("FROM traces_v0(project_id = '{SAMPLE_PROJECT_ID}') AS traces")
        ),
        "got: {result}"
    );
    assert!(
        contains_ws(
            &result,
            &format!("FROM spans_v0(project_id = '{SAMPLE_PROJECT_ID}') AS spans")
        ),
        "got: {result}"
    );
    // WHERE bounds preserved on both CTEs.
    assert!(
        contains_ws(
            &result,
            "start_time >= toDateTime('2025-08-06 00:00:00') AND start_time < toDateTime('2025-08-09 00:00:00')"
        ),
        "got: {result}"
    );
    // USING (user_id) join preserved.
    assert!(contains_ws(&result, "USING(user_id)"), "got: {result}");
}

#[test]
fn test_with_fill_simple_query() {
    let query = r#"
SELECT
    toStartOfMinute(start_time) as time_bucket,
    COUNT(*) as span_count
FROM spans
WHERE start_time >= '2024-01-01'
GROUP BY toStartOfMinute(start_time)
ORDER BY time_bucket WITH FILL STEP INTERVAL 1 MINUTE
"#;
    let result = validate_ok(query);
    assert!(
        contains_ws(
            &result,
            &format!("FROM spans_v0(project_id = '{SAMPLE_PROJECT_ID}') AS spans")
        ),
        "got: {result}"
    );
}

#[test]
fn test_nested_cte_shadowing_protected_table_rejected() {
    // A CTE named `spans` defined in an inner scope must not make the outer
    // `FROM spans` (the real physical table) skip project-scoping. We reject the
    // collision outright so the outer reference can never escape the rewrite.
    let query = r#"
        SELECT * FROM spans
        WHERE trace_id IN (
          WITH spans AS (SELECT trace_id FROM traces)
          SELECT trace_id FROM spans
        )
    "#;
    let err = validate(query).expect_err("CTE shadowing a protected table must be rejected");
    assert!(
        err.contains("collides with a protected table name"),
        "got: {err}"
    );
}

#[test]
fn test_cte_shadowing_protected_table_top_level_rejected() {
    // Same collision at the top level.
    let query = r#"
        WITH spans AS (SELECT trace_id FROM traces)
        SELECT trace_id FROM spans
    "#;
    let err = validate(query).expect_err("CTE shadowing a protected table must be rejected");
    assert!(
        err.contains("collides with a protected table name"),
        "got: {err}"
    );
}

#[test]
fn test_cte_with_safe_name_still_allowed() {
    // A CTE whose name doesn't collide with a protected table is unaffected;
    // the inner `spans` reference is still rewritten to the scoped view.
    let query = r#"
        WITH span_ids AS (SELECT trace_id FROM spans)
        SELECT trace_id FROM span_ids
    "#;
    let result = validate_ok(query);
    assert!(
        contains_ws(
            &result,
            &format!("FROM spans_v0(project_id = '{SAMPLE_PROJECT_ID}') AS spans")
        ),
        "got: {result}"
    );
    assert!(contains_ws(&result, "FROM span_ids"), "got: {result}");
}

#[test]
fn test_reject_typed_dict_and_join_get_functions() {
    // Typed / suffixed variants of the dictionary + joinGet families must be
    // blocked by prefix, not just the bare names — they can read another
    // project's data out of a `(project_id, ...)`-keyed dictionary.
    let blocked = [
        "SELECT dictGetString('shared_content_dict', 'content', tuple(1, 2)) FROM spans",
        "SELECT dictGetUInt64('d', 'a', 1) FROM spans",
        "SELECT dictGetOrDefault('d', 'a', 1, 0) FROM spans",
        "SELECT dictGetHierarchy('d', 1) FROM spans",
        "SELECT dictIsIn('d', 1, 2) FROM spans",
        "SELECT joinGet('j', 'a', 1) FROM spans",
        "SELECT joinGetOrNull('j', 'a', 1) FROM spans",
    ];
    for query in blocked {
        let err = validate(query).expect_err(&format!("expected rejection for: {query}"));
        assert!(err.contains("not allowed"), "query {query} gave: {err}");
    }
}

#[test]
fn test_reject_info_disclosure_functions() {
    let blocked = [
        "SELECT currentDatabase() FROM spans",
        "SELECT currentUser() FROM spans",
        "SELECT hostName() FROM spans",
        "SELECT getSetting('max_threads') FROM spans",
    ];
    for query in blocked {
        let err = validate(query).expect_err(&format!("expected rejection for: {query}"));
        assert!(err.contains("not allowed"), "query {query} gave: {err}");
    }
}

#[test]
fn test_reject_allowlisted_table_as_table_function() {
    // Presenting an allowlisted table name with arg qualifiers must be rejected
    // rather than left as a bare, unscoped relation.
    let err = validate("SELECT * FROM spans(1)")
        .expect_err("allowlisted table used as a table function must be rejected");
    assert!(
        err.contains("cannot be used as a table function"),
        "got: {err}"
    );
}

#[test]
fn test_in_with_array_placeholder_unparenthesized() {
    // Bare `IN {p:Array(...)}` (no parens) is what the frontend sends; upstream
    // sqlparser can't parse it, so we wrap it. Both the bare and parenthesized
    // forms must validate and preserve the placeholder verbatim.
    let bare = r#"
        SELECT span_id FROM spans
        WHERE span_id IN {spanIds: Array(UUID)}
    "#;
    let result = validate_ok(bare);
    assert!(
        contains_ws(&result, "span_id IN ({spanIds: Array(UUID)})"),
        "got: {result}"
    );
    assert!(
        contains_ws(
            &result,
            &format!("FROM spans_v0(project_id = '{SAMPLE_PROJECT_ID}') AS spans")
        ),
        "got: {result}"
    );
}

#[test]
fn test_in_with_array_placeholder_full_query() {
    // The exact failing query shape from the bug report.
    let query = r#"
        SELECT
          span_id as spanId,
          if(span_type = 'TOOL', input, output) as data,
          name
        FROM spans
        WHERE trace_id = {traceId: UUID}
          AND span_id IN {spanIds: Array(UUID)}
          AND span_type IN ('LLM', 'CACHED', 'TOOL', 'EXECUTOR', 'EVALUATOR')
          AND start_time >= {startDate: String}
        AND start_time <= {endDate: String}
    "#;
    let result = validate_ok(query);
    // Placeholder list preserved; literal `IN (...)` list untouched.
    assert!(
        contains_ws(&result, "span_id IN ({spanIds: Array(UUID)})"),
        "got: {result}"
    );
    assert!(
        contains_ws(
            &result,
            "span_type IN ('LLM', 'CACHED', 'TOOL', 'EXECUTOR', 'EVALUATOR')"
        ),
        "got: {result}"
    );
}

#[test]
fn test_in_placeholder_inside_string_literal_not_rewritten() {
    // A brace group that only appears inside a string literal must NOT be
    // treated as a placeholder list — the tokenizer makes it opaque, so the
    // `IN ('...')` here stays a normal literal list.
    let query = r#"
        SELECT span_id FROM spans
        WHERE name IN ('a IN {not a placeholder}', 'b')
    "#;
    let result = validate_ok(query);
    assert!(
        contains_ws(&result, "name IN ('a IN {not a placeholder}', 'b')"),
        "got: {result}"
    );
}

#[test]
fn test_not_in_with_array_placeholder() {
    let query = r#"
        SELECT span_id FROM spans
        WHERE span_id NOT IN {spanIds: Array(UUID)}
    "#;
    let result = validate_ok(query);
    assert!(
        contains_ws(&result, "span_id NOT IN ({spanIds: Array(UUID)})"),
        "got: {result}"
    );
}

#[test]
fn test_array_join_column_not_rewritten() {
    // `ARRAY JOIN clusters AS cluster_id` unnests the `clusters` ARRAY column of
    // signal_events — `clusters` here is a column, NOT the `clusters` table, so
    // it must be left untouched even though a `clusters` table exists. Only the
    // real FROM table (`signal_events`) is rewritten to its scoped view.
    let query = r#"
        SELECT DISTINCT cluster_id
        FROM signal_events
        ARRAY JOIN clusters AS cluster_id
        WHERE signal_id = {signalId: UUID}
    "#;
    let result = validate_ok(query);
    assert!(
        contains_ws(
            &result,
            &format!("FROM signal_events_v0(project_id = '{SAMPLE_PROJECT_ID}') AS signal_events")
        ),
        "got: {result}"
    );
    // The array column stays a bare `clusters`, NOT `clusters_v0(...)`.
    assert!(
        contains_ws(&result, "ARRAY JOIN clusters AS cluster_id"),
        "got: {result}"
    );
    assert!(!result.contains("clusters_v0"), "got: {result}");
}

#[test]
fn test_left_array_join_column_not_rewritten() {
    let query = r#"
        SELECT cluster_id
        FROM signal_events
        LEFT ARRAY JOIN clusters AS cluster_id
        WHERE signal_id = {signalId: UUID}
    "#;
    let result = validate_ok(query);
    assert!(
        contains_ws(&result, "LEFT ARRAY JOIN clusters AS cluster_id"),
        "got: {result}"
    );
    assert!(!result.contains("clusters_v0"), "got: {result}");
}

#[test]
fn test_array_join_does_not_shadow_real_clusters_table() {
    // A query that ARRAY JOINs the `clusters` column AND separately selects from
    // the real `clusters` table: only the table reference is rewritten, the
    // array-join column is left alone (span-keyed, so the two don't conflate).
    let query = r#"
        SELECT c.id
        FROM clusters c
        WHERE c.id IN (
            SELECT cluster_id
            FROM signal_events
            ARRAY JOIN clusters AS cluster_id
            WHERE signal_id = {signalId: UUID}
        )
    "#;
    let result = validate_ok(query);
    // The real FROM table is scoped...
    assert!(
        contains_ws(
            &result,
            &format!("FROM clusters_v0(project_id = '{SAMPLE_PROJECT_ID}') AS c")
        ),
        "got: {result}"
    );
    // ...while the array-join column is untouched.
    assert!(
        contains_ws(&result, "ARRAY JOIN clusters AS cluster_id"),
        "got: {result}"
    );
    // Exactly one rewritten clusters view (the table), not two.
    assert_eq!(result.matches("clusters_v0").count(), 1, "got: {result}");
}

#[test]
fn test_full_clusters_emerging_query() {
    // The exact shape from the frontend bug report (clusters table + ARRAY JOIN
    // on the clusters column inside the subquery).
    let query = r#"
        SELECT
          id,
          name,
          parent_id as parentId,
          level
        FROM clusters
        WHERE signal_id = {signalId: UUID}
          AND level != 0
          AND id IN (
            SELECT DISTINCT cluster_id
            FROM signal_events
            ARRAY JOIN clusters AS cluster_id
            WHERE signal_id = {signalId: UUID}
          )
        ORDER BY num_signal_events DESC, level ASC, created_at ASC
    "#;
    let result = validate_ok(query);
    assert!(
        contains_ws(
            &result,
            &format!("FROM clusters_v0(project_id = '{SAMPLE_PROJECT_ID}') AS clusters")
        ),
        "got: {result}"
    );
    assert!(
        contains_ws(
            &result,
            &format!("FROM signal_events_v0(project_id = '{SAMPLE_PROJECT_ID}') AS signal_events")
        ),
        "got: {result}"
    );
    assert!(
        contains_ws(&result, "ARRAY JOIN clusters AS cluster_id"),
        "got: {result}"
    );
    // Only the outer clusters TABLE is rewritten; the array-join column is not.
    assert_eq!(result.matches("clusters_v0").count(), 1, "got: {result}");
}

#[test]
fn test_interval_with_unit_inside_string_literal() {
    // LAM-1854: ClickHouse (and Postgres) accept the unit inside the string
    // literal, e.g. `interval '1 day'`. sqlparser's stock ClickHouseDialect
    // rejects it ("INTERVAL requires a unit after the literal value"); our
    // optional-qualifier dialect must parse it and round-trip it verbatim.
    let result = validate_ok(
        "SELECT span_id FROM spans WHERE start_time > now() - interval '1 day' LIMIT 1",
    );
    assert!(
        contains_ws(
            &result,
            &format!("FROM spans_v0(project_id = '{SAMPLE_PROJECT_ID}') AS spans")
        ),
        "got: {result}"
    );
    // The unit must NOT be hoisted out of the literal into a trailing qualifier
    // (that would corrupt the SQL sent to ClickHouse).
    assert!(
        contains_ws(&result, "start_time > now() - INTERVAL '1 day'"),
        "interval literal not preserved verbatim in: {result}"
    );
    assert!(!contains_ws(&result, "'1 day' SECOND"), "got: {result}");
}

#[test]
fn test_interval_with_explicit_unit_still_parses() {
    // The classic `INTERVAL 1 HOUR` form must keep working after the dialect
    // swap.
    let result =
        validate_ok("SELECT span_id FROM spans WHERE start_time > now() - INTERVAL 1 HOUR LIMIT 1");
    assert!(
        contains_ws(&result, "start_time > now() - INTERVAL 1 HOUR"),
        "got: {result}"
    );
}

#[test]
fn test_interval_various_units_inside_string_literal() {
    for unit in ["1 hour", "30 minute", "2 week", "3 month", "1 year"] {
        let query = format!(
            "SELECT span_id FROM spans WHERE start_time > now() - interval '{unit}' LIMIT 1"
        );
        let result = validate_ok(&query);
        assert!(
            contains_ws(&result, &format!("INTERVAL '{unit}'")),
            "unit '{unit}' not preserved in: {result}"
        );
    }
}

#[test]
fn test_string_literal_resembling_interval_not_misparsed() {
    // A plain string literal that merely contains the words is NOT an INTERVAL
    // and must survive untouched.
    let result = validate_ok("SELECT span_id FROM spans WHERE name = '1 day ago' LIMIT 1");
    assert!(contains_ws(&result, "name = '1 day ago'"), "got: {result}");
}
