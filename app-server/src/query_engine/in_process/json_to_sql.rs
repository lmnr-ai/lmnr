//! JSON-query-structure → ClickHouse SQL conversion for the in-process query
//! engine. Ported from `query-engine/src/json_to_sql.py`.
//!
//! The raw-expression path (metrics with `fn == "raw"`) is a security boundary:
//! it parses the user fragment, rejects SQL comments, subqueries, multi-column
//! expressions, and blocked functions, then regenerates the SQL from the parsed
//! AST so the interpolated SQL always matches what was validated.

use std::ops::ControlFlow;

use sqlparser::ast::{Expr, Query, SelectItem, SetExpr, Statement, Visit, Visitor};
use sqlparser::dialect::ClickHouseDialect;
use sqlparser::parser::Parser;
use sqlparser::tokenizer::{Token, Tokenizer, Whitespace};

use super::types::{FilterValue, Metric, OrderBy, QueryStructure, TimeRange};
use super::validator::find_blocked_function_in_expr;

const ALLOWED_METRIC_FNS: &[&str] = &["count", "sum", "avg", "min", "max", "quantile"];

fn comparison_op(op: &str) -> Option<&'static str> {
    match op.to_lowercase().as_str() {
        "eq" => Some("="),
        "ne" => Some("!="),
        "gt" => Some(">"),
        "gte" => Some(">="),
        "lt" => Some("<"),
        "lte" => Some("<="),
        _ => None,
    }
}

fn is_placeholder(value: &str) -> bool {
    value.starts_with('{') && value.ends_with('}') && value.contains(':')
}

/// Render a number without a trailing `.0` (matches Python's int/float str()).
fn format_number(n: f64) -> String {
    if n.fract() == 0.0 && n.is_finite() {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

fn format_filter_value(value: &FilterValue) -> String {
    match value {
        FilterValue::NumberValue(n) => format_number(*n),
        FilterValue::StringValue(s) => {
            if is_placeholder(s) {
                s.clone()
            } else {
                format!("'{s}'")
            }
        }
    }
}

pub fn convert_json_to_sql(query: &QueryStructure) -> Result<String, String> {
    let has_time_range = query.time_range.is_some();
    let has_dimensions = !query.dimensions.is_empty();
    let has_metrics = !query.metrics.is_empty();

    if !(has_time_range || has_dimensions || has_metrics) {
        return Err("Query must have at least one of: metrics, dimensions, or time_range".to_string());
    }

    let mut parts: Vec<String> = vec![
        "SELECT".to_string(),
        build_select_clause(query)?,
        format!("FROM {}", query.table),
    ];

    if let Some(where_clause) = build_where_clause(query)? {
        parts.push(where_clause);
    }
    if let Some(group_clause) = build_group_by_clause(query) {
        parts.push(group_clause);
    }
    if let Some(order_clause) = build_order_by_clause(query)? {
        parts.push(order_clause);
    }
    if let Some(limit) = query.limit {
        parts.push(format!("LIMIT {limit}"));
    }

    Ok(parts.join("\n"))
}

fn get_interval_expr(time_range: &TimeRange) -> Result<String, String> {
    if time_range.interval_value.is_empty() || time_range.interval_unit.is_empty() {
        return Err("timeRange must specify 'interval_value' and 'interval_unit'".to_string());
    }
    Ok(format!(
        "toInterval({}, {})",
        time_range.interval_value, time_range.interval_unit
    ))
}

fn time_bucket_sql(time_range: &TimeRange) -> Result<String, String> {
    let interval_expr = get_interval_expr(time_range)?;
    Ok(format!(
        "toStartOfInterval({}, {}) AS time",
        time_range.column, interval_expr
    ))
}

fn build_select_clause(query: &QueryStructure) -> Result<String, String> {
    let mut select_items: Vec<String> = Vec::new();

    if let Some(time_range) = &query.time_range {
        select_items.push(time_bucket_sql(time_range)?);
    }

    for dim in &query.dimensions {
        if dim != "time" || query.time_range.is_none() {
            select_items.push(dim.clone());
        }
    }

    for metric in &query.metrics {
        select_items.push(metric_sql(metric)?);
    }

    Ok(format!("    {}", select_items.join(",\n    ")))
}

fn build_where_clause(query: &QueryStructure) -> Result<Option<String>, String> {
    let mut conditions: Vec<String> = Vec::new();

    for filter in &query.filters {
        conditions.push(filter_sql(filter)?);
    }

    if let Some(time_range) = &query.time_range {
        conditions.extend(get_time_range_conditions(query, time_range));
    }

    if conditions.is_empty() {
        Ok(None)
    } else {
        Ok(Some(format!("WHERE\n    {}", conditions.join("\n    AND "))))
    }
}

fn get_time_range_conditions(query: &QueryStructure, time_range: &TimeRange) -> Vec<String> {
    let mut conditions = Vec::new();
    let col = &time_range.column;
    let time_from = &time_range.from;
    let time_to = &time_range.to;

    let matches_filter_value = |value: &Option<FilterValue>, expected: &str| -> bool {
        match value {
            Some(FilterValue::StringValue(s)) => s == expected,
            Some(FilterValue::NumberValue(n)) => format_number(*n) == expected,
            None => false,
        }
    };

    let has_gte = query.filters.iter().any(|f| {
        f.field == *col && f.op.to_lowercase() == "gte" && matches_filter_value(&f.value, time_from)
    });
    let has_lte = query.filters.iter().any(|f| {
        f.field == *col && f.op.to_lowercase() == "lte" && matches_filter_value(&f.value, time_to)
    });

    if !has_gte {
        conditions.push(format!("{col} >= {time_from}"));
    }
    if !has_lte {
        conditions.push(format!("{col} <= {time_to}"));
    }

    conditions
}

fn build_group_by_clause(query: &QueryStructure) -> Option<String> {
    let mut group_cols: Vec<String> = Vec::new();

    if query.time_range.is_some() {
        group_cols.push("time".to_string());
    }

    for dim in &query.dimensions {
        if dim != "time" || query.time_range.is_none() {
            group_cols.push(dim.clone());
        }
    }

    if group_cols.is_empty() {
        None
    } else {
        Some(format!("GROUP BY {}", group_cols.join(", ")))
    }
}

fn build_order_by_clause(query: &QueryStructure) -> Result<Option<String>, String> {
    let mut order_clause = if !query.order_by.is_empty() {
        let orders: Vec<String> = query
            .order_by
            .iter()
            .map(|o: &OrderBy| {
                let dir = if o.dir.is_empty() {
                    "ASC".to_string()
                } else {
                    o.dir.to_uppercase()
                };
                format!("{} {}", o.field, dir)
            })
            .collect();
        format!("ORDER BY {}", orders.join(", "))
    } else if query.time_range.is_some() {
        "ORDER BY time".to_string()
    } else {
        return Ok(None);
    };

    if let Some(time_range) = &query.time_range {
        if time_range.fill_gaps {
            let interval_expr = get_interval_expr(time_range)?;
            order_clause.push_str(&format!(
                " WITH FILL\n    FROM toStartOfInterval({}, {})\n    TO toStartOfInterval({}, {})\n    STEP {}",
                time_range.from, interval_expr, time_range.to, interval_expr, interval_expr
            ));
        }
    }

    Ok(Some(order_clause))
}

fn escape_alias(alias: &str) -> String {
    format!("`{}`", alias.replace('`', "``"))
}

/// Detect SQL comments in a fragment using the tokenizer, so `--`/`/*` inside
/// string literals are not mistaken for comments.
fn contains_sql_comment(sql: &str) -> bool {
    let dialect = ClickHouseDialect {};
    match Tokenizer::new(&dialect, sql).tokenize() {
        Ok(tokens) => tokens.iter().any(|t| {
            matches!(
                t,
                Token::Whitespace(Whitespace::SingleLineComment { .. })
                    | Token::Whitespace(Whitespace::MultiLineComment(_))
            )
        }),
        Err(_) => false,
    }
}

struct SubqueryScanner {
    found: bool,
}

impl Visitor for SubqueryScanner {
    type Break = ();

    fn pre_visit_query(&mut self, _query: &Query) -> ControlFlow<()> {
        self.found = true;
        ControlFlow::Break(())
    }
}

fn expr_contains_subquery(expr: &Expr) -> bool {
    let mut scanner = SubqueryScanner { found: false };
    let _ = expr.visit(&mut scanner);
    scanner.found
}

/// Validate a raw SQL expression and return it regenerated from the parsed AST.
fn validate_raw_expression(expr: &str) -> Result<String, String> {
    if expr.trim().is_empty() {
        return Err("Raw SQL expression cannot be empty".to_string());
    }

    if contains_sql_comment(expr) {
        return Err("SQL comments are not allowed in raw SQL expressions".to_string());
    }

    let dialect = ClickHouseDialect {};
    let wrapped = format!("SELECT {expr} FROM t");
    let mut statements = Parser::parse_sql(&dialect, &wrapped)
        .map_err(|e| format!("Invalid SQL expression: {e}"))?;

    if statements.len() != 1 {
        return Err("Raw SQL must be a single expression".to_string());
    }

    let select = match statements.remove(0) {
        Statement::Query(query) => match *query.body {
            SetExpr::Select(select) => select,
            _ => return Err("Invalid SQL expression".to_string()),
        },
        _ => return Err("Invalid SQL expression".to_string()),
    };

    if select.projection.len() != 1 {
        return Err("Raw SQL must be a single expression".to_string());
    }

    let inner_expr = match &select.projection[0] {
        SelectItem::UnnamedExpr(e) => e.clone(),
        SelectItem::ExprWithAlias { expr, .. } => expr.clone(),
        _ => return Err("Raw SQL must be a single expression".to_string()),
    };

    if expr_contains_subquery(&inner_expr) {
        return Err("Subqueries are not allowed in raw SQL expressions".to_string());
    }

    if let Some(blocked) = find_blocked_function_in_expr(&inner_expr) {
        return Err(format!(
            "Function '{blocked}' is not allowed in raw SQL expressions"
        ));
    }

    Ok(select.projection[0].to_string())
}

/// Sanitize a metric column by parsing and regenerating. `*` passes through.
fn safe_column_expr(col: &str) -> Result<String, String> {
    if col == "*" {
        return Ok(col.to_string());
    }

    let dialect = ClickHouseDialect {};
    let wrapped = format!("SELECT {col} FROM t");
    let mut statements = Parser::parse_sql(&dialect, &wrapped)
        .map_err(|e| format!("Invalid column expression: {e}"))?;

    if statements.len() != 1 {
        return Err("Column must be a single expression".to_string());
    }

    let select = match statements.remove(0) {
        Statement::Query(query) => match *query.body {
            SetExpr::Select(select) => select,
            _ => return Err("Invalid column expression".to_string()),
        },
        _ => return Err("Invalid column expression".to_string()),
    };

    if select.projection.len() != 1 {
        return Err("Column must be a single expression".to_string());
    }

    Ok(select.projection[0].to_string())
}

fn metric_sql(metric: &Metric) -> Result<String, String> {
    let fn_lower = metric.r#fn.to_lowercase();
    let col = &metric.column;

    if fn_lower == "raw" {
        let alias = metric.alias.clone().unwrap_or_else(|| "value".to_string());
        let safe_alias = escape_alias(&alias);
        let safe_expr = validate_raw_expression(col)?;
        return Ok(format!("({safe_expr}) AS {safe_alias}"));
    }

    if !ALLOWED_METRIC_FNS.contains(&fn_lower.as_str()) {
        return Err(format!("Unsupported metric function: {}", metric.r#fn));
    }

    let alias = metric
        .alias
        .clone()
        .unwrap_or_else(|| format!("{fn_lower}_{col}"));
    let safe_alias = escape_alias(&alias);
    let safe_col = safe_column_expr(col)?;

    if fn_lower == "quantile" && !metric.args.is_empty() {
        let q = metric.args[0];
        return Ok(format!(
            "quantile({})({}) AS {}",
            format_number(q),
            safe_col,
            safe_alias
        ));
    }

    Ok(format!("{}({}) AS {}", metric.r#fn, safe_col, safe_alias))
}

fn filter_sql(filter: &super::types::Filter) -> Result<String, String> {
    let value = filter
        .value
        .as_ref()
        .ok_or_else(|| "Filter must have either string_value or number_value".to_string())?;

    let op_lower = filter.op.to_lowercase();

    if let Some(op) = comparison_op(&op_lower) {
        return Ok(format!(
            "{} {} {}",
            filter.field,
            op,
            format_filter_value(value)
        ));
    }

    if op_lower == "includes" {
        return Ok(format!(
            "has({}, {})",
            filter.field,
            format_filter_value(value)
        ));
    }

    Err(format!("Unsupported operator: {}", filter.op))
}

#[cfg(test)]
mod tests;
