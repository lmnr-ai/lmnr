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
    /// Negation of `Includes`: true only when NONE of the listed items appear.
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
        FilterOperator::Includes | FilterOperator::NotIncludes => {
            log::warn!("Invalid operator {operator:?} for number filter");
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

/// Set membership. `Includes` is true when ANY listed item is present,
/// `NotIncludes` only when NONE are.
///
/// The pre-`includes` `eq`/`ne` shape is deliberately NOT accepted: migration
/// 0107 converted every signal row, and alert payloads cannot hold arrays (a
/// signal's structured-output schema only declares string/number/boolean/enum),
/// so nothing reaches here carrying one. Rejecting is fail-closed — a stray
/// legacy row logs and stops its signal instead of silently evaluating, which
/// is how an incomplete migration becomes visible.
///
/// An empty `array` satisfies `NotIncludes`, so callers must resolve "state
/// unknown" before calling — this can't tell that from a genuinely empty set. A
/// blank or empty target rejects both operators: `FilterSchema` allows `" "`,
/// which would otherwise match every row under a negation.
#[cfg_attr(not(feature = "signals"), allow(dead_code))]
pub fn evaluate_array_contains_filter(
    array: &[String],
    operator: &FilterOperator,
    value: &Value,
) -> bool {
    let targets: Vec<&str> = match value {
        Value::Array(items) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .collect(),
        _ => value
            .as_str()
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .into_iter()
            .collect(),
    };
    if targets.is_empty() {
        return false;
    }

    let present = targets
        .iter()
        .any(|target| array.iter().any(|item| item == target));

    match operator {
        FilterOperator::Includes => present,
        FilterOperator::NotIncludes => !present,
        _ => {
            log::warn!(
                "Invalid operator {:?} for array containment filter, only includes/not_includes supported",
                operator
            );
            false
        }
    }
}

// Ungated: the function builds under default features, so gating the tests on
// `signals` would skip them on a plain `cargo test`.
#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn names() -> Vec<String> {
        vec!["agent.run".to_string(), "tool.call".to_string()]
    }

    /// The pre-`includes` shape must NOT quietly keep working: migration 0107
    /// converts every signal row, so a surviving `eq`/`ne` means the migration
    /// did not run. Rejecting makes that visible instead of silently correct.
    #[test]
    fn legacy_scalar_operators_are_rejected() {
        for operator in [FilterOperator::Eq, FilterOperator::Ne] {
            assert!(
                !evaluate_array_contains_filter(&names(), &operator, &json!("tool.call")),
                "{operator:?} must no longer evaluate against an array"
            );
            assert!(
                !evaluate_array_contains_filter(&names(), &operator, &json!(["tool.call"])),
                "{operator:?} must reject even with a migrated list value"
            );
        }
    }

    /// `includes` matches ANY listed item; `not_includes` only when NONE appear.
    #[test]
    fn list_operators_are_any_of_and_none_of() {
        let any_of =
            |value| evaluate_array_contains_filter(&names(), &FilterOperator::Includes, &value);
        assert!(any_of(json!(["absent", "tool.call"])), "one hit is enough");
        assert!(!any_of(json!(["absent", "also.absent"])));

        let none_of =
            |value| evaluate_array_contains_filter(&names(), &FilterOperator::NotIncludes, &value);
        assert!(none_of(json!(["absent", "also.absent"])), "none present");
        assert!(
            !none_of(json!(["absent", "tool.call"])),
            "one present is enough to fail"
        );

        // `not_includes` is satisfied by a genuinely empty set, like `ne`.
        assert!(evaluate_array_contains_filter(
            &[],
            &FilterOperator::NotIncludes,
            &json!(["agent.run"])
        ));
    }

    /// `FilterSchema` allows `" "`, which must not match everything under a negation.
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
            for operator in [FilterOperator::Includes, FilterOperator::NotIncludes] {
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
