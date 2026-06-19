use super::{convert_sql_to_json, extract_metric};
use crate::query_engine::json_to_sql::convert_json_to_sql;
use crate::query_engine::types::{Filter, FilterValue, Metric, OrderBy, QueryStructure, TimeRange};
use sqlparser::dialect::ClickHouseDialect;
use sqlparser::parser::Parser;

// ---- TestSqlToJsonConversion ----

#[test]
fn test_simple_query_with_limit() {
    let sql = r#"
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
    let result = convert_sql_to_json(sql).unwrap();

    assert_eq!(result.table, "spans");
    assert_eq!(result.metrics[0].r#fn, "count"); // lowercase
    assert_eq!(result.metrics[0].column, "span_id");
    assert!(result.dimensions.contains(&"name".to_string()));
    assert_eq!(result.limit, Some(5));
    assert_eq!(result.order_by[0].field, "value");
    assert_eq!(result.order_by[0].dir, "desc");
}

#[test]
fn test_time_series_query_with_fill() {
    let sql = r#"
SELECT
    toStartOfInterval(start_time, toInterval(1, {interval_unit:String})) AS time,
    model,
    quantile(0.9)(end_time - start_time) AS value
FROM spans
WHERE
    model != '<null>'
  AND span_type = 'LLM'
  AND start_time >= {start_time:DateTime64}
  AND start_time <= {end_time:DateTime64}
GROUP BY time, model
ORDER BY time
WITH FILL
FROM toStartOfInterval({start_time:DateTime64}, toInterval(1, {interval_unit:String}))
TO toStartOfInterval({end_time:DateTime64}, toInterval(1, {interval_unit:String}))
STEP toInterval(1, {interval_unit:String})
"#;
    let result = convert_sql_to_json(sql).unwrap();

    assert_eq!(result.table, "spans");
    let tr = result.time_range.as_ref().unwrap();
    assert_eq!(tr.column, "start_time");
    assert!(tr.fill_gaps);
    assert!(result.dimensions.contains(&"model".to_string()));
    assert_eq!(result.metrics[0].r#fn, "quantile");
    assert_eq!(result.metrics[0].args, vec![0.9]);
    assert_eq!(result.metrics[0].column, "end_time - start_time");
    assert_eq!(result.metrics[0].alias, Some("value".to_string()));
}

#[test]
fn test_complex_raw_expression_not_reduced_to_sub_aggregate() {
    let dialect = ClickHouseDialect {};

    let parse_expr = |frag: &str| {
        let wrapped = format!("SELECT {frag} FROM t");
        let stmts = Parser::parse_sql(&dialect, &wrapped).unwrap();
        // Reach into the single projection expression.
        use sqlparser::ast::{SelectItem, SetExpr, Statement};
        let stmt = stmts.into_iter().next().unwrap();
        let query = match stmt {
            Statement::Query(q) => q,
            _ => panic!("not a query"),
        };
        let select = match *query.body {
            SetExpr::Select(s) => s,
            _ => panic!("not a select"),
        };
        match select.projection.into_iter().next().unwrap() {
            SelectItem::UnnamedExpr(e) => e,
            SelectItem::ExprWithAlias { expr, .. } => expr,
            _ => panic!("unexpected projection"),
        }
    };

    let expr = parse_expr("countIf(status = 'ERROR') / count(*)");
    let result = extract_metric(&expr, "error_rate");
    assert_eq!(result.r#fn, "raw", "expected raw, got {}", result.r#fn);
    assert!(
        result.column.contains("countIf"),
        "expected countIf in column, got {}",
        result.column
    );
    assert_eq!(result.alias, Some("error_rate".to_string()));

    let simple_expr = parse_expr("count(*)");
    let simple_result = extract_metric(&simple_expr, "total");
    assert_eq!(simple_result.r#fn, "count");
}

// ---- TestRoundTripConversion ----

fn metric(fn_: &str, column: &str, args: Vec<f64>, alias: Option<&str>) -> Metric {
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

#[test]
fn test_simple_query_roundtrip() {
    let original = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("COUNT", "span_id", vec![], Some("value"))],
        dimensions: vec!["name".to_string()],
        filters: vec![
            sfilter("start_time", "gte", "{start_time:DateTime64}"),
            sfilter("start_time", "lte", "{end_time:DateTime64}"),
        ],
        time_range: None,
        order_by: vec![OrderBy {
            field: "value".to_string(),
            dir: "desc".to_string(),
        }],
        limit: Some(5),
    };

    let sql = convert_json_to_sql(&original).unwrap();
    let result = convert_sql_to_json(&sql).unwrap();

    assert_eq!(result.table, original.table);
    assert_eq!(result.metrics[0].r#fn, original.metrics[0].r#fn.to_lowercase());
    assert_eq!(result.limit, original.limit);
}

#[test]
fn test_time_series_query_roundtrip() {
    let original = QueryStructure {
        table: "spans".to_string(),
        metrics: vec![metric("COUNT", "*", vec![], Some("value"))],
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

    let sql = convert_json_to_sql(&original).unwrap();
    let result = convert_sql_to_json(&sql).unwrap();

    assert_eq!(result.table, original.table);
    let rtr = result.time_range.as_ref().unwrap();
    let otr = original.time_range.as_ref().unwrap();
    assert_eq!(rtr.fill_gaps, otr.fill_gaps);
    assert_eq!(rtr.column, otr.column);
    assert!(!result.metrics.is_empty());
}
