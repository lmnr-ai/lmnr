use std::str::FromStr;

use rand::distributions::{Alphanumeric, DistString};
use serde_json::json;
use sqlx::{Postgres, QueryBuilder};
use uuid::Uuid;

use crate::opentelemetry::opentelemetry_proto_common_v1;

use super::modifiers::DateRange;

pub fn generate_random_key() -> String {
    Alphanumeric.sample_string(&mut rand::thread_rng(), 64)
}

pub fn convert_any_value_to_json_value(
    any_value: Option<opentelemetry_proto_common_v1::AnyValue>,
) -> serde_json::Value {
    match any_value.unwrap().value.unwrap() {
        opentelemetry_proto_common_v1::any_value::Value::StringValue(val) => {
            let mut val = val;

            // this is a workaround for cases when json.dumps equivalent is applied multiple times to the same value
            while let Ok(serde_json::Value::String(v)) =
                serde_json::from_str::<serde_json::Value>(&val)
            {
                val = v;
            }

            serde_json::Value::String(val)
        }
        opentelemetry_proto_common_v1::any_value::Value::BoolValue(val) => {
            serde_json::Value::Bool(val)
        }
        opentelemetry_proto_common_v1::any_value::Value::IntValue(val) => json!(val),
        opentelemetry_proto_common_v1::any_value::Value::DoubleValue(val) => {
            serde_json::Value::Number(serde_json::Number::from_f64(val).unwrap())
        }
        opentelemetry_proto_common_v1::any_value::Value::ArrayValue(val) => {
            let values: Vec<serde_json::Value> = val
                .values
                .into_iter()
                .map(|v| convert_any_value_to_json_value(Some(v)))
                .collect();
            json!(values)
        }
        opentelemetry_proto_common_v1::any_value::Value::KvlistValue(val) => {
            let map: serde_json::Map<String, serde_json::Value> = val
                .values
                .into_iter()
                .map(|kv| {
                    (
                        kv.key,
                        convert_any_value_to_json_value(Some(kv.value.unwrap())),
                    )
                })
                .collect();
            json!(map)
        }
        opentelemetry_proto_common_v1::any_value::Value::BytesValue(val) => {
            serde_json::Value::from_str(String::from_utf8(val).unwrap().as_str()).unwrap()
        }
    }
}

pub fn span_id_to_uuid(span_id: &[u8]) -> Uuid {
    let mut padded_vec = vec![0; 8];
    padded_vec.extend_from_slice(&span_id.to_vec());
    Uuid::from_slice(&padded_vec).unwrap()
}

pub fn validate_sql_string(s: &str) -> bool {
    s.chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '.')
}

pub fn add_date_range_to_query(
    query: &mut QueryBuilder<Postgres>,
    date_range: &Option<DateRange>,
    column_name: &str,
    column_name_end: Option<&str>,
) -> anyhow::Result<()> {
    let Some(date_range) = date_range else {
        return Ok(());
    };
    if !validate_sql_string(column_name) {
        return Ok(());
    }
    if column_name_end.is_some_and(|s| !validate_sql_string(s)) {
        return Ok(());
    }

    match date_range {
        DateRange::Relative(interval) => {
            let past_hours = if interval.past_hours == "all" {
                None
            } else {
                Some(interval.past_hours.parse::<i64>()?)
            };
            if let Some(past_hours) = past_hours {
                query.push(format!(
                    " AND {} >= NOW() - interval '{} hours'",
                    column_name, past_hours
                ));
            }
        }
        DateRange::Absolute(interval) => {
            query
                // .push(" AND start_time >= ")
                .push(" AND ")
                .push(column_name)
                .push(" >= ")
                .push_bind(interval.start_date)
                .push(" AND ")
                .push(column_name_end.unwrap_or(column_name))
                .push(" <= ")
                .push_bind(interval.end_date);
        }
    };

    Ok(())
}
