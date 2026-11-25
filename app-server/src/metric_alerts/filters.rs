//! Turns a rule's trace filters into a ClickHouse predicate over `traces_v0`.
//! Mirrors the traces table (`frontend/lib/actions/traces/utils.ts`), so a
//! rule matches the traces the same filters show there. Column names come
//! from the fixed lists below and every value is bound.

use serde_json::Value;

use super::rule::Filter;

const STRING_COLUMNS: [&str; 5] = [
    "session_id",
    "user_id",
    "trace_type",
    "top_span_type",
    "top_span_name",
];
const ARRAY_COLUMNS: [&str; 3] = ["tags", "trace_tags", "span_names"];
const FLOAT_COLUMNS: [&str; 4] = ["total_cost", "input_cost", "output_cost", "duration"];
const INT_COLUMNS: [&str; 3] = ["total_tokens", "input_tokens", "output_tokens"];

#[derive(Debug, Clone, PartialEq)]
pub enum Bind {
    Text(String),
    Float(f64),
    Int(i64),
}

/// A predicate with `?` placeholders and the values to bind, in order.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct FilterSql {
    pub sql: String,
    pub binds: Vec<Bind>,
}

fn text(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

fn number(filter: &Filter) -> Result<f64, String> {
    let parsed = match &filter.value {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    };
    parsed
        .filter(|n| n.is_finite())
        .ok_or(format!("Filter on {} needs a number", filter.column))
}

fn comparison(operator: &str) -> Option<&'static str> {
    match operator {
        "eq" => Some("="),
        "ne" => Some("!="),
        "lt" => Some("<"),
        "gt" => Some(">"),
        "lte" => Some("<="),
        "gte" => Some(">="),
        _ => None,
    }
}

fn unsupported(filter: &Filter) -> String {
    format!(
        "Operator {} is not supported on {}",
        filter.operator, filter.column
    )
}

fn string_clause(filter: &Filter, out: &mut FilterSql) -> Result<String, String> {
    let column = &filter.column;
    let value = text(&filter.value);
    match (filter.operator.as_str(), value.as_str()) {
        ("is", "empty") => Ok(format!("empty({column})")),
        ("is", "not_empty") => Ok(format!("notEmpty({column})")),
        ("eq", _) | ("ne", _) => {
            let op = comparison(&filter.operator).unwrap_or("=");
            out.binds.push(Bind::Text(value));
            Ok(format!("{column} {op} ?"))
        }
        _ => Err(unsupported(filter)),
    }
}

fn status_clause(filter: &Filter) -> Result<String, String> {
    let is_error = match (filter.operator.as_str(), text(&filter.value).as_str()) {
        ("eq", "error") | ("ne", "success") => true,
        ("eq", "success") | ("ne", "error") => false,
        _ => return Err(unsupported(filter)),
    };
    Ok(if is_error {
        "status = 'error'"
    } else {
        "status != 'error'"
    }
    .to_string())
}

fn array_clause(filter: &Filter, out: &mut FilterSql) -> Result<String, String> {
    let negate = match filter.operator.as_str() {
        "eq" | "includes" => "",
        "ne" | "not_includes" => "NOT ",
        _ => return Err(unsupported(filter)),
    };
    let values: Vec<String> = match &filter.value {
        Value::Array(items) => items.iter().map(text).collect(),
        other => vec![text(other)],
    };
    if values.is_empty() {
        return Err(format!("Filter on {} needs a value", filter.column));
    }
    let placeholders = vec!["?"; values.len()].join(", ");
    out.binds.extend(values.into_iter().map(Bind::Text));
    Ok(format!(
        "{negate}hasAny({}, [{placeholders}])",
        filter.column
    ))
}

fn number_clause(filter: &Filter, integer: bool, out: &mut FilterSql) -> Result<String, String> {
    let op = comparison(&filter.operator).ok_or(unsupported(filter))?;
    let value = number(filter)?;
    out.binds.push(if integer {
        Bind::Int(value as i64)
    } else {
        Bind::Float(value)
    });
    Ok(format!("{} {op} ?", filter.column))
}

fn metadata_clause(filter: &Filter, out: &mut FilterSql) -> Result<String, String> {
    let value = text(&filter.value);
    let (key, expected) = value
        .split_once('=')
        .ok_or("Metadata filter must look like key=value".to_string())?;
    if filter.operator != "eq" {
        return Err(unsupported(filter));
    }
    for part in [key, expected, key, expected] {
        out.binds.push(Bind::Text(part.to_string()));
    }
    Ok(
        "(simpleJSONExtractString(metadata, ?) = ? OR simpleJSONExtractRaw(metadata, ?) = ?)"
            .to_string(),
    )
}

fn agent_input_clause(filter: &Filter, out: &mut FilterSql) -> Result<String, String> {
    let value = text(&filter.value);
    let clause = match filter.operator.as_str() {
        "eq" => "(agent_input = ? OR JSONExtractString(agent_input) = ?)",
        "ne" => "(agent_input != ? AND JSONExtractString(agent_input) != ?)",
        _ => return Err(unsupported(filter)),
    };
    out.binds.push(Bind::Text(value.clone()));
    out.binds.push(Bind::Text(value));
    Ok(clause.to_string())
}

/// Builds the predicate for a rule's filters. Empty filters give an empty
/// predicate.
pub fn build_where(filters: &[Filter]) -> Result<FilterSql, String> {
    let mut out = FilterSql::default();
    let mut clauses = Vec::with_capacity(filters.len());
    for filter in filters {
        let column = filter.column.as_str();
        let clause = if column == "status" {
            status_clause(filter)?
        } else if column == "metadata" {
            metadata_clause(filter, &mut out)?
        } else if column == "agent_input" {
            agent_input_clause(filter, &mut out)?
        } else if STRING_COLUMNS.contains(&column) {
            string_clause(filter, &mut out)?
        } else if ARRAY_COLUMNS.contains(&column) {
            array_clause(filter, &mut out)?
        } else if FLOAT_COLUMNS.contains(&column) {
            number_clause(filter, false, &mut out)?
        } else if INT_COLUMNS.contains(&column) {
            number_clause(filter, true, &mut out)?
        } else {
            return Err(format!("Unknown filter column {column}"));
        };
        clauses.push(clause);
    }
    out.sql = clauses.join(" AND ");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn filter(column: &str, operator: &str, value: Value) -> Filter {
        Filter {
            column: column.to_string(),
            operator: operator.to_string(),
            value,
        }
    }

    #[test]
    fn build_bound_predicates() {
        let filters = [
            filter("user_id", "eq", json!("u1")),
            filter("tags", "includes", json!(["a", "b"])),
            filter("total_cost", "gt", json!("0.5")),
            filter("status", "ne", json!("success")),
            filter("metadata", "eq", json!("env=prod")),
        ];
        let built = build_where(&filters).unwrap();
        assert_eq!(
            built.sql,
            "user_id = ? AND hasAny(tags, [?, ?]) AND total_cost > ? AND status = 'error' AND \
             (simpleJSONExtractString(metadata, ?) = ? OR simpleJSONExtractRaw(metadata, ?) = ?)"
        );
        assert_eq!(built.binds.len(), 8);
        assert_eq!(built.binds[3], Bind::Float(0.5));
    }

    #[test]
    fn reject_unknown_input() {
        let injected = filter("1=1; DROP TABLE spans", "eq", json!("x"));
        assert!(build_where(&[injected]).is_err());
        assert!(build_where(&[filter("user_id", "gt", json!("x"))]).is_err());
        assert!(build_where(&[filter("total_cost", "gt", json!("abc"))]).is_err());
    }
}
