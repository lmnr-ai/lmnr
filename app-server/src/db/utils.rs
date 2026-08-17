use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub fn span_id_to_uuid(span_id: &[u8]) -> Uuid {
    let mut padded_vec = vec![0; 8];
    padded_vec.extend_from_slice(&span_id.to_vec());
    Uuid::from_slice(&padded_vec).unwrap()
}

#[cfg_attr(not(feature = "signals"), allow(dead_code))]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FilterOperator {
    Eq,
    Ne,
    Gt,
    Gte,
    Lt,
    Lte,
    /// Array containment. The frontend's shared `FilterSchema` requires this
    /// operator for any array-valued filter (e.g. a signal trigger listing
    /// several span names), so it must deserialize here or the whole filter
    /// fails to parse and the trigger is dropped.
    Includes,
    /// Negation of `Includes`. The frontend writes it camelCased.
    #[serde(rename = "notIncludes")]
    NotIncludes,
}

#[cfg_attr(not(feature = "signals"), allow(dead_code))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Filter {
    pub column: String,
    pub operator: FilterOperator,
    pub value: Value,
}

#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub fn evaluate_number_filter(actual: f64, operator: &FilterOperator, value: &Value) -> bool {
    let target = match value {
        Value::Number(n) => match n.as_f64() {
            Some(f) => f,
            None => return false,
        },
        Value::String(s) => match s.parse::<f64>() {
            Ok(f) => f,
            Err(_) => return false,
        },
        _ => return false,
    };

    match operator {
        FilterOperator::Eq => (actual - target).abs() < f64::EPSILON,
        FilterOperator::Ne => (actual - target).abs() >= f64::EPSILON,
        FilterOperator::Gt => actual > target,
        FilterOperator::Gte => actual >= target,
        FilterOperator::Lt => actual < target,
        FilterOperator::Lte => actual <= target,
        _ => {
            log::warn!("Invalid operator {:?} for number filter", operator);
            false
        }
    }
}

#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub fn evaluate_string_filter(actual: &str, operator: &FilterOperator, value: &Value) -> bool {
    let target = value.as_str().unwrap_or("");

    match operator {
        FilterOperator::Eq => actual == target,
        FilterOperator::Ne => actual != target,
        _ => {
            log::warn!(
                "Invalid operator {:?} for string filter, only eq/ne supported",
                operator
            );
            false
        }
    }
}

#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub fn evaluate_boolean_filter(actual: bool, operator: &FilterOperator, value: &Value) -> bool {
    let target = match value {
        Value::Bool(b) => *b,
        Value::String(s) => match s.parse::<bool>() {
            Ok(b) => b,
            Err(_) => return false,
        },
        _ => return false,
    };

    match operator {
        FilterOperator::Eq => actual == target,
        FilterOperator::Ne => actual != target,
        _ => {
            log::warn!(
                "Invalid operator {:?} for boolean filter, only eq/ne supported",
                operator
            );
            false
        }
    }
}

/// Set membership: `Includes`/`Eq` = contains any target, `NotIncludes`/`Ne` =
/// contains none. `eq`/`ne` are the pre-`includes` shape and stay supported.
///
/// The value is one target or a list of them. An empty `array` satisfies the
/// negative operators, so callers must resolve "state unknown" before calling —
/// this can't tell that from a genuinely empty set. Blank targets are dropped
/// (`FilterSchema` allows `" "`, which would otherwise match every row under
/// negation), and a value with no usable target rejects.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub fn evaluate_array_contains_filter(
    array: &[String],
    operator: &FilterOperator,
    value: &Value,
) -> bool {
    let targets: Vec<&str> = match value {
        Value::Array(items) => items.iter().filter_map(Value::as_str).collect(),
        Value::String(s) => vec![s.as_str()],
        _ => return false,
    }
    .into_iter()
    .map(str::trim)
    .filter(|target| !target.is_empty())
    .collect();

    if targets.is_empty() {
        return false;
    }

    let present = array.iter().any(|item| targets.contains(&item.as_str()));

    match operator {
        FilterOperator::Eq | FilterOperator::Includes => present,
        FilterOperator::Ne | FilterOperator::NotIncludes => !present,
        _ => {
            log::warn!(
                "Invalid operator {:?} for array containment filter",
                operator
            );
            false
        }
    }
}

// Ungated: `--features signals` doesn't compile in OSS, so gating these on it
// would make them dead here even though the function itself builds.
#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn names() -> Vec<String> {
        vec!["agent.run".to_string(), "tool.call".to_string()]
    }

    #[test]
    fn contains_filter_handles_both_directions() {
        assert!(evaluate_array_contains_filter(
            &names(),
            &FilterOperator::Eq,
            &json!("tool.call")
        ));
        assert!(!evaluate_array_contains_filter(
            &names(),
            &FilterOperator::Eq,
            &json!("absent")
        ));

        // `ne` must pass when the value is genuinely absent.
        assert!(evaluate_array_contains_filter(
            &names(),
            &FilterOperator::Ne,
            &json!("absent")
        ));
        assert!(!evaluate_array_contains_filter(
            &names(),
            &FilterOperator::Ne,
            &json!("tool.call")
        ));
    }

    /// Empty means empty, never "state unknown" — conflating them silently drops
    /// legitimate "field is absent" alert filters.
    #[test]
    fn empty_array_is_a_real_empty_set() {
        assert!(!evaluate_array_contains_filter(
            &[],
            &FilterOperator::Eq,
            &json!("agent.run")
        ));
        assert!(evaluate_array_contains_filter(
            &[],
            &FilterOperator::Ne,
            &json!("agent.run")
        ));
    }

    /// A list matches ANY of its targets; negation requires ALL absent.
    #[test]
    fn list_target_matches_any() {
        assert!(evaluate_array_contains_filter(
            &names(),
            &FilterOperator::Includes,
            &json!(["absent", "tool.call"])
        ));
        assert!(!evaluate_array_contains_filter(
            &names(),
            &FilterOperator::Includes,
            &json!(["absent", "also.absent"])
        ));

        assert!(evaluate_array_contains_filter(
            &names(),
            &FilterOperator::NotIncludes,
            &json!(["absent", "also.absent"])
        ));
        assert!(!evaluate_array_contains_filter(
            &names(),
            &FilterOperator::NotIncludes,
            &json!(["absent", "tool.call"])
        ));
    }

    /// `FilterSchema` allows `" "`, which must not match everything under `ne`.
    #[test]
    fn blank_or_non_string_target_rejects() {
        for value in [
            json!(""),
            json!(" "),
            json!("\t"),
            json!(null),
            json!(42),
            json!([]),
            json!([" "]),
        ] {
            for operator in [
                FilterOperator::Eq,
                FilterOperator::Ne,
                FilterOperator::Includes,
                FilterOperator::NotIncludes,
            ] {
                assert!(
                    !evaluate_array_contains_filter(&names(), &operator, &value),
                    "value {value} must reject under {operator:?}"
                );
            }
        }
    }

    /// The frontend persists `notIncludes`; `rename_all = "snake_case"` alone
    /// would expect `not_includes` and drop the whole filter.
    #[test]
    fn not_includes_deserializes_from_the_persisted_json() {
        let filter: Filter = serde_json::from_value(
            json!({ "column": "span_names", "operator": "notIncludes", "value": ["agent.run"] }),
        )
        .expect("persisted filter JSON must parse");
        assert_eq!(filter.operator, FilterOperator::NotIncludes);
    }

    #[test]
    fn unsupported_operator_rejects() {
        assert!(!evaluate_array_contains_filter(
            &names(),
            &FilterOperator::Gt,
            &json!("agent.run")
        ));
    }
}
