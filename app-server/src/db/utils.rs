use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub fn span_id_to_uuid(span_id: &[u8]) -> Uuid {
    let mut padded_vec = vec![0; 8];
    padded_vec.extend_from_slice(&span_id.to_vec());
    Uuid::from_slice(&padded_vec).unwrap()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FilterOperator {
    Eq,
    Ne,
    Gt,
    Gte,
    Lt,
    Lte,
    Includes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Filter {
    pub column: String,
    pub operator: FilterOperator,
    pub value: Value,
}

pub fn evaluate_number_filter(actual: f64, operator: &FilterOperator, value: &Value) -> bool {
    let target = match value {
        Value::Number(n) => n.as_f64().unwrap_or(0.0),
        Value::String(s) => s.parse::<f64>().unwrap_or(0.0),
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

pub fn evaluate_array_contains_filter(
    array: &[String],
    operator: &FilterOperator,
    value: &Value,
) -> bool {
    let target = value.as_str().unwrap_or("");

    match operator {
        FilterOperator::Eq | FilterOperator::Includes => array.iter().any(|item| item == target),
        _ => {
            log::warn!(
                "Invalid operator {:?} for array containment filter, only eq/includes supported",
                operator
            );
            false
        }
    }
}
