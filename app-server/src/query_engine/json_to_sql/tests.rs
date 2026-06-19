use super::*;
use crate::query_engine::types::{Filter, FilterValue, Metric, OrderBy, QueryStructure, TimeRange};

fn norm(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn contains_ws(haystack: &str, needle: &str) -> bool {
    norm(haystack).contains(&norm(needle))
}

fn metric(fn_: &str, column: &str, alias: Option<&str>) -> Metric {
    Metric {
        r#fn: fn_.to_string(),
        column: column.to_string(),
        args: vec![],
        alias: alias.map(|s| s.to_string()),
    }
}

fn metric_args(fn_: &str, column: &str, args: Vec<f64>, alias: Option<&str>) -> Metric {
    Metric {
        r#fn: fn_.to_string(),
        column: column.to_string(),
        args,
        alias: alias.map(|s| s.to_string()),
    }
}

fn sfilter(field: &str, op: &str, value: &str) -> Filter {
    Filter {
        field: field.to_string(),
        op: op.to_string(),
        value: Some(FilterValue::StringValue(value.to_string())),
    }
}

fn nfilter(field: &str, op: &str, value: f64) -> Filter {
    Filter {
        field: field.to_string(),
        op: op.to_string(),
        value: Some(FilterValue::NumberValue(value)),
    }
}

fn order(field: &str, dir: &str) -> OrderBy {
    OrderBy {
        field: field.to_string(),
        dir: dir.to_string(),
    }
}

fn time_filters() -> Vec<Filter> {
    vec![
        sfilter("start_time", "gte", "{start_time:DateTime64}"),
        sfilter("start_time", "lte", "{end_time:DateTime64}"),
    ]
}

fn convert(q: &QueryStructure) -> String {
    convert_json_to_sql(q).expect("conversion should succeed")
}

#[test]
fn test_simple_query_with_limit() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("COUNT", "span_id", Some("value"))],
        dimensions: vec!["name".to_string()],
        filters: time_filters(),
        time_range: None,
        order_by: vec![order("value", "desc")],
        limit: Some(5),
    };

    let sql = convert(&q);

    let expected = "SELECT\n    name,\n    COUNT(span_id) AS `value`\nFROM spans\nWHERE\n    start_time >= {start_time:DateTime64}\n    AND start_time <= {end_time:DateTime64}\nGROUP BY name\nORDER BY value DESC\nLIMIT 5";
    assert_eq!(sql, expected);
}

#[test]
fn test_time_series_query_with_fill() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric_args(
            "quantile",
            "end_time - start_time",
            vec![0.9],
            Some("value"),
        )],
        dimensions: vec!["model".to_string()],
        filters: vec![
            sfilter("model", "ne", "<null>"),
            sfilter("span_type", "eq", "LLM"),
        ],
        time_range: Some(TimeRange {
            column: "start_time".to_string(),
            from: "{start_time:DateTime64}".to_string(),
            to: "{end_time:DateTime64}".to_string(),
            interval_unit: "{interval_unit:String}".to_string(),
            interval_value: "1".to_string(),
            fill_gaps: true,
        }),
        order_by: vec![],
        limit: None,
    };

    let sql = convert(&q);

    assert!(contains_ws(
        &sql,
        "toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time"
    ));
    assert!(contains_ws(
        &sql,
        "quantile(0.9)(end_time - start_time) AS `value`"
    ));
    assert!(contains_ws(&sql, "model != '<null>'"));
    assert!(contains_ws(&sql, "span_type = 'LLM'"));
    assert!(contains_ws(&sql, "GROUP BY time, model"));
    assert!(contains_ws(&sql, "ORDER BY time WITH FILL"));
    assert!(contains_ws(
        &sql,
        "STEP toInterval(1, {interval_unit:String})"
    ));
}

#[test]
fn test_raw_sql_metric() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![
            metric("raw", "countIf(status = 'ERROR')", Some("error_count")),
            metric("COUNT", "*", Some("total")),
        ],
        dimensions: vec!["name".to_string()],
        filters: time_filters(),
        time_range: None,
        order_by: vec![order("error_count", "desc")],
        limit: Some(10),
    };

    let sql = convert(&q);

    assert!(contains_ws(
        &sql,
        "(countIf(status = 'ERROR')) AS `error_count`"
    ));
    assert!(contains_ws(&sql, "COUNT(*) AS `total`"));
    assert!(contains_ws(&sql, "GROUP BY name"));
    assert!(contains_ws(&sql, "ORDER BY error_count DESC"));
    assert!(contains_ws(&sql, "LIMIT 10"));
}

#[test]
fn test_raw_sql_metric_backtick_alias_escaping() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("raw", "count()", Some("my`alias"))],
        dimensions: vec!["name".to_string()],
        filters: time_filters(),
        time_range: None,
        order_by: vec![],
        limit: None,
    };

    let sql = convert(&q);
    assert!(contains_ws(&sql, "(count()) AS `my``alias`"));
}

#[test]
fn test_raw_sql_metric_without_alias_uses_default() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("raw", "countIf(status = 'ERROR')", None)],
        dimensions: vec!["name".to_string()],
        filters: time_filters(),
        time_range: None,
        order_by: vec![],
        limit: None,
    };

    let sql = convert(&q);
    assert!(contains_ws(
        &sql,
        "(countIf(status = 'ERROR')) AS `value`"
    ));
}

#[test]
fn test_raw_sql_metric_rejects_subquery() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("raw", "(SELECT 1)", Some("bad"))],
        dimensions: vec!["name".to_string()],
        filters: time_filters(),
        time_range: None,
        order_by: vec![],
        limit: None,
    };

    let err = convert_json_to_sql(&q).unwrap_err();
    assert!(err.contains("Subqueries are not allowed"), "got: {err}");
}

#[test]
fn test_raw_sql_metric_rejects_blocked_functions() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("raw", "url('http://evil.com')", Some("bad"))],
        dimensions: vec!["name".to_string()],
        filters: time_filters(),
        time_range: None,
        order_by: vec![],
        limit: None,
    };

    let err = convert_json_to_sql(&q).unwrap_err();
    assert!(err.contains("not allowed"), "got: {err}");
}

#[test]
fn test_raw_sql_metric_rejects_typed_dict_get() {
    // The raw-expression path shares the validator's blocked-function check, so
    // the prefix-blocked typed dictGet family is rejected here too.
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric(
            "raw",
            "dictGetString('shared_content_dict', 'content', tuple(1, 2))",
            Some("bad"),
        )],
        dimensions: vec!["name".to_string()],
        filters: time_filters(),
        time_range: None,
        order_by: vec![],
        limit: None,
    };

    let err = convert_json_to_sql(&q).unwrap_err();
    assert!(err.contains("not allowed"), "got: {err}");
}

#[test]
fn test_raw_sql_metric_rejects_multiple_expressions() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("raw", "count(*), name", Some("bad"))],
        dimensions: vec!["name".to_string()],
        filters: time_filters(),
        time_range: None,
        order_by: vec![],
        limit: None,
    };

    let err = convert_json_to_sql(&q).unwrap_err();
    assert!(err.contains("single expression"), "got: {err}");
}

#[test]
fn test_raw_sql_metric_rejects_comments() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("raw", "1 FROM other_table\n--", Some("bad"))],
        dimensions: vec!["name".to_string()],
        filters: time_filters(),
        time_range: None,
        order_by: vec![],
        limit: None,
    };

    let err = convert_json_to_sql(&q).unwrap_err();
    assert!(err.contains("comments are not allowed"), "got: {err}");
}

#[test]
fn test_raw_sql_metric_allows_comment_chars_in_strings() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("raw", "countIf(path LIKE '--%')", Some("prefixed"))],
        dimensions: vec!["name".to_string()],
        filters: time_filters(),
        time_range: None,
        order_by: vec![],
        limit: None,
    };

    let sql = convert(&q);
    assert!(contains_ws(&sql, "(countIf(path LIKE '--%'))"));
}

#[test]
fn test_metric_alias_does_not_shadow_filter_column() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("avg", "total_tokens", None)],
        dimensions: vec![],
        filters: vec![
            nfilter("total_tokens", "gt", 0.0),
            sfilter("start_time", "gte", "{start_time:DateTime64}"),
            sfilter("start_time", "lte", "{end_time:DateTime64}"),
        ],
        time_range: None,
        order_by: vec![],
        limit: None,
    };

    let sql = convert(&q);

    assert!(!contains_ws(&sql, "AS `total_tokens`"));
    assert!(contains_ws(&sql, "avg(total_tokens) AS `avg_total_tokens`"));
    assert!(contains_ws(&sql, "total_tokens > 0"));
}

#[test]
fn test_metric_with_explicit_alias_preserves_alias() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("sum", "cost", Some("total_cost"))],
        dimensions: vec![],
        filters: time_filters(),
        time_range: None,
        order_by: vec![],
        limit: None,
    };

    let sql = convert(&q);
    assert!(contains_ws(&sql, "sum(cost) AS `total_cost`"));
}

#[test]
fn test_metric_without_alias_uses_fn_column_pattern() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("max", "latency", None)],
        dimensions: vec!["name".to_string()],
        filters: time_filters(),
        time_range: None,
        order_by: vec![],
        limit: None,
    };

    let sql = convert(&q);
    assert!(contains_ws(&sql, "max(latency) AS `max_latency`"));
}

#[test]
fn test_string_filter_value_escapes_single_quotes() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("count", "*", Some("value"))],
        dimensions: vec![],
        filters: vec![sfilter("name", "eq", "O'Brien")],
        time_range: None,
        order_by: vec![],
        limit: None,
    };

    let sql = convert(&q);
    assert!(contains_ws(&sql, "name = 'O''Brien'"), "got: {sql}");

    // The escaped SQL must parse back cleanly (no spurious quote breaking the literal).
    use sqlparser::dialect::ClickHouseDialect;
    use sqlparser::parser::Parser;
    Parser::parse_sql(&ClickHouseDialect {}, &sql).expect("escaped SQL should parse");
}

#[test]
fn test_empty_query_validation() {
    let q = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![],
        dimensions: vec![],
        filters: vec![sfilter("name", "eq", "'test'")],
        time_range: None,
        order_by: vec![],
        limit: None,
    };

    let err = convert_json_to_sql(&q).unwrap_err();
    assert!(
        err.contains("Query must have at least one of: metrics, dimensions, or time_range"),
        "got: {err}"
    );
}
