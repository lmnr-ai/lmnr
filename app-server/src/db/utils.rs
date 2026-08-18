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
        FilterOperator::Includes => {
            log::warn!("Invalid operator Includes for number filter");
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

/// Set membership: `Eq` = contains, `Ne` = does not contain.
///
/// An empty `array` satisfies `Ne`, so callers must resolve "state unknown"
/// before calling — this can't tell that from a genuinely empty set. A blank
/// target rejects both operators: `FilterSchema` allows `" "`, which would
/// otherwise match every row under `Ne`.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub fn evaluate_array_contains_filter(
    array: &[String],
    operator: &FilterOperator,
    value: &Value,
) -> bool {
    let Some(target) = value.as_str().map(str::trim).filter(|t| !t.is_empty()) else {
        return false;
    };

    let present = array.iter().any(|item| item == target);

    match operator {
        FilterOperator::Eq => present,
        FilterOperator::Ne => !present,
        _ => {
            log::warn!(
                "Invalid operator {:?} for array containment filter, only eq/ne supported",
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

    /// `FilterSchema` allows `" "`, which must not match everything under `ne`.
    #[test]
    fn blank_or_non_string_target_rejects() {
        for value in [json!(""), json!(" "), json!("\t"), json!(null), json!(42)] {
            for operator in [FilterOperator::Eq, FilterOperator::Ne] {
                assert!(
                    !evaluate_array_contains_filter(&names(), &operator, &value),
                    "value {value} must reject under {operator:?}"
                );
            }
        }
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
