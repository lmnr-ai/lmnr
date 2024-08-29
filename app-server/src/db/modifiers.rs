use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, PartialEq, Clone)]
pub struct Filter {
    pub filter_value: Value,
    pub filter_operator: FilterOperator,
    pub filter_column: String,
    /// prefix for a flattened jsonb key.
    /// E.g. if the filter is by `metadata.user_id` or, more precisely, in postgres,
    /// `metadata @> '{user_id: filter_value}'`, this field will contain
    /// Some(String::from("metadata"))`. Otherwise is `None`.
    pub jsonb_column: Option<String>,
}

#[derive(Deserialize)]
struct UrlParamFilter {
    value: Value,
    operator: String,
    column: String,
}

#[derive(Debug, PartialEq, Clone)]
pub enum FilterOperator {
    Eq,
    Lt,
    Gt,
    Lte,
    Gte,
    Ne,
}

impl FilterOperator {
    fn from_string(string: &str) -> Self {
        match string {
            "eq" => Self::Eq,
            "lt" => Self::Lt,
            "gt" => Self::Gt,
            "lte" => Self::Lte,
            "gte" => Self::Gte,
            "ne" => Self::Ne,
            _ => Self::Eq,
        }
    }

    pub fn to_sql_operator(&self) -> String {
        match self {
            FilterOperator::Eq => String::from("="),
            FilterOperator::Lt => String::from("<"),
            FilterOperator::Gt => String::from(">"),
            FilterOperator::Lte => String::from("<="),
            FilterOperator::Gte => String::from(">="),
            FilterOperator::Ne => String::from("!="),
        }
    }
}

impl Filter {
    pub fn from_url_params(url_params: Value) -> Option<Vec<Self>> {
        // TODO: these hacks are there, because `actix_web` (not `actix_web_lab`) does not support
        // repeated url params, such as `?filter=...&filter=...`.
        match url_params {
            Value::String(filter) => {
                let arr = serde_json::from_str::<Vec<Value>>(&filter).ok()?;
                Self::from_url_params(Value::Array(arr))
            }
            Value::Array(values) => Some(
                values
                    .into_iter()
                    .filter_map(|value| {
                        let filter: UrlParamFilter = serde_json::from_value(value).ok()?;
                        let (jsonb_column, filter_column) = if filter.column.starts_with("jsonb::")
                        {
                            let mut split =
                                filter.column.strip_prefix("jsonb::").unwrap().split("::");
                            (
                                Some(split.next().unwrap().to_string()),
                                split.next().unwrap().to_string(),
                            )
                        } else {
                            (None, filter.column.to_string())
                        };
                        Some(Self {
                            filter_value: filter.value,
                            filter_operator: FilterOperator::from_string(&filter.operator),
                            filter_column,
                            jsonb_column,
                        })
                    })
                    .collect(),
            ),
            _ => None,
        }
    }
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AbsoluteDateInterval {
    pub start_date: DateTime<Utc>,
    pub end_date: DateTime<Utc>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RelativeDateInterval {
    pub past_hours: String,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum DateRange {
    Relative(RelativeDateInterval),
    Absolute(AbsoluteDateInterval),
}

impl Default for DateRange {
    fn default() -> Self {
        DateRange::Relative(RelativeDateInterval {
            past_hours: String::from("24"),
        })
    }
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub enum GroupByInterval {
    Minute,
    Hour,
    Day,
}

impl GroupByInterval {
    pub fn to_sql(&self) -> &str {
        match self {
            GroupByInterval::Minute => "minute",
            GroupByInterval::Hour => "hour",
            GroupByInterval::Day => "day",
        }
    }
}

impl Default for GroupByInterval {
    fn default() -> Self {
        GroupByInterval::Hour
    }
}

#[cfg(test)]
mod tests {
    use super::FilterOperator;

    #[test]
    fn test_filter_type_from_string() {
        assert_eq!(FilterOperator::from_string("eq"), FilterOperator::Eq);
        assert_eq!(FilterOperator::from_string("ne"), FilterOperator::Ne);
        assert_eq!(FilterOperator::from_string("lt"), FilterOperator::Lt);
        assert_eq!(FilterOperator::from_string("lte"), FilterOperator::Lte);
        assert_eq!(FilterOperator::from_string("gt"), FilterOperator::Gt);
        assert_eq!(FilterOperator::from_string("gte"), FilterOperator::Gte);
        assert_eq!(
            FilterOperator::from_string("some_other_string"),
            FilterOperator::Eq
        );
    }

    #[test]
    fn test_filter_type_to_sql() {
        assert_eq!(FilterOperator::Eq.to_sql_operator(), String::from("="));
        assert_eq!(FilterOperator::Ne.to_sql_operator(), String::from("!="));
        assert_eq!(FilterOperator::Lt.to_sql_operator(), String::from("<"));
        assert_eq!(FilterOperator::Lte.to_sql_operator(), String::from("<="));
        assert_eq!(FilterOperator::Gt.to_sql_operator(), String::from(">"));
        assert_eq!(FilterOperator::Gte.to_sql_operator(), String::from(">="));
    }
}
