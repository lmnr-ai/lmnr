use std::collections::HashMap;
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use sqlx::QueryBuilder;
use uuid::Uuid;

use crate::routes::error::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum FilterOperator {
    #[serde(rename = "eq")]
    Eq,
    #[serde(rename = "neq")]
    Neq,
    #[serde(rename = "gt")]
    Gt,
    #[serde(rename = "gte")]
    Gte,
    #[serde(rename = "lt")]
    Lt,
    #[serde(rename = "lte")]
    Lte,
    #[serde(rename = "ilike")]
    ILike,
    #[serde(rename = "not_ilike")]
    NotILike,
}

impl FromStr for FilterOperator {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "eq" => Ok(FilterOperator::Eq),
            "neq" => Ok(FilterOperator::Neq),
            "gt" => Ok(FilterOperator::Gt),
            "gte" => Ok(FilterOperator::Gte),
            "lt" => Ok(FilterOperator::Lt),
            "lte" => Ok(FilterOperator::Lte),
            "ilike" => Ok(FilterOperator::ILike),
            "not_ilike" => Ok(FilterOperator::NotILike),
            _ => Err(format!("Invalid filter operator: {}", s)),
        }
    }
}

impl FilterOperator {
    pub fn to_sql(&self) -> &'static str {
        match self {
            FilterOperator::Eq => "=",
            FilterOperator::Neq => "!=",
            FilterOperator::Gt => ">",
            FilterOperator::Gte => ">=",
            FilterOperator::Lt => "<",
            FilterOperator::Lte => "<=",
            FilterOperator::ILike => "ILIKE",
            FilterOperator::NotILike => "NOT ILIKE",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FilterValue {
    String(String),
    Number(f64),
    Boolean(bool),
    Json { key: String, value: String },
}

impl FilterValue {
    pub fn from_string(s: &str, field_type: &FieldType) -> Result<Self, String> {
        match field_type {
            FieldType::String => Ok(FilterValue::String(s.to_string())),
            FieldType::Integer => {
                let num = s.parse::<i64>()
                    .map_err(|_| format!("Invalid integer value: {}", s))?;
                Ok(FilterValue::Number(num as f64))
            },
            FieldType::Float => {
                let num = s.parse::<f64>()
                    .map_err(|_| format!("Invalid float value: {}", s))?;
                Ok(FilterValue::Number(num))
            },
            FieldType::Boolean => {
                let bool_val = match s.to_lowercase().as_str() {
                    "true" => true,
                    "false" => false,
                    _ => return Err(format!("Invalid boolean value: {}", s)),
                };
                Ok(FilterValue::Boolean(bool_val))
            },
            FieldType::Enum => {
                Ok(FilterValue::String(s.to_string()))
            },
            FieldType::Uuid => {
                Uuid::parse_str(s.trim())
                    .map_err(|_| format!("Invalid UUID format: {}", s))?;
                Ok(FilterValue::String(s.to_string()))
            },
            FieldType::Json => {
                // Parse key=value format
                if let Some(eq_pos) = s.find('=') {
                    let key = s[..eq_pos].to_string();
                    let value = s[eq_pos + 1..].to_string();
                    Ok(FilterValue::Json { key, value })
                } else {
                    Err("JSON value must be in 'key=value' format".to_string())
                }
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum FieldType {
    String,
    Integer,
    Float,
    Boolean,
    Enum,
    Uuid,
    Json,
}

impl FieldType {
    pub fn allows_operator(&self, operator: &FilterOperator) -> bool {
        match self {
            FieldType::String => matches!(operator, 
                FilterOperator::Eq | FilterOperator::Neq | 
                FilterOperator::ILike | FilterOperator::NotILike
            ),
            FieldType::Integer | FieldType::Float => matches!(operator,
                FilterOperator::Eq | FilterOperator::Neq |
                FilterOperator::Gt | FilterOperator::Gte |
                FilterOperator::Lt | FilterOperator::Lte
            ),
            FieldType::Boolean | FieldType::Enum | FieldType::Uuid => {
                matches!(operator, FilterOperator::Eq | FilterOperator::Neq)
            },
            FieldType::Json => {
                matches!(operator, FilterOperator::Eq | FilterOperator::Neq)
            },
        }
    }
}

#[derive(Debug, Clone)]
pub struct FieldConfig {
    pub field_type: FieldType,
    pub sql_column: String,
    pub validator: Option<fn(&FilterValue) -> Result<(), String>>,
}

impl FieldConfig {
    pub fn new(field_type: FieldType, sql_column: impl Into<String>) -> Self {
        Self {
            field_type,
            sql_column: sql_column.into(),
            validator: None,
        }
    }

    pub fn with_validator(mut self, validator: fn(&FilterValue) -> Result<(), String>) -> Self {
        self.validator = Some(validator);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Filter {
    pub field: String,
    pub operator: FilterOperator,
    pub value: FilterValue,
}

impl Filter {
    pub fn new(field: impl Into<String>, operator: FilterOperator, value: FilterValue) -> Self {
        Self {
            field: field.into(),
            operator,
            value,
        }
    }

    pub fn validate(&self, field_configs: &HashMap<String, FieldConfig>) -> Result<(), String> {
        let field_config = field_configs.get(&self.field)
            .ok_or_else(|| format!("Unknown field: {}", self.field))?;

        if !field_config.field_type.allows_operator(&self.operator) {
            return Err(format!(
                "Operator {:?} is not allowed for field '{}' of type {:?}",
                self.operator, self.field, field_config.field_type
            ));
        }

        if let Some(validator) = field_config.validator {
            validator(&self.value)?;
        }

        Ok(())
    }

    pub fn apply_to_query_builder<'a>(
        &self,
        mut query_builder: QueryBuilder<'a, sqlx::Postgres>,
        field_configs: &HashMap<String, FieldConfig>,
    ) -> Result<QueryBuilder<'a, sqlx::Postgres>, String> {
        let field_config = field_configs.get(&self.field)
            .ok_or_else(|| format!("Unknown field: {}", self.field))?;

        query_builder.push(" AND ");
        query_builder.push(&field_config.sql_column);
        query_builder.push(" ");

        match (&self.operator, &self.value) {
            (FilterOperator::ILike | FilterOperator::NotILike, FilterValue::String(s)) => {
                query_builder.push(self.operator.to_sql());
                query_builder.push(" ");
                query_builder.push_bind(format!("%{}%", s));
            },
            (FilterOperator::Eq, FilterValue::Json { key, value }) => {
                query_builder.push("@> ");
                let json_obj = serde_json::json!({ key: value });
                query_builder.push_bind(json_obj);
            },
            (FilterOperator::Neq, FilterValue::Json { key, value }) => {
                query_builder.push("NOT @> ");
                let json_obj = serde_json::json!({ key: value });
                query_builder.push_bind(json_obj);
            },
            _ => {
                query_builder.push(self.operator.to_sql());
                query_builder.push(" ");
                match &self.value {
                    FilterValue::String(s) => query_builder.push_bind(s.clone()),
                    FilterValue::Number(n) => {
                        if field_config.field_type == FieldType::Integer {
                            query_builder.push_bind(*n as i64)
                        } else {
                            query_builder.push_bind(*n)
                        }
                    },
                    FilterValue::Boolean(b) => query_builder.push_bind(*b),
                    FilterValue::Json { .. } => {
                        return Err("JSON filters must use Eq or Neq operators".to_string());
                    }
                };
            }
        }

        Ok(query_builder)
    }
}

pub fn deserialize_filters<'de, D>(deserializer: D) -> Result<Vec<Filter>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error;
    
    let opt_value: Option<String> = Option::deserialize(deserializer)?;
    let filters_str = match opt_value {
        Some(s) if !s.is_empty() => s,
        _ => return Ok(Vec::new()),
    };

    let mut filters = Vec::new();
    for filter_str in filters_str.split(',') {
        let filter_str = filter_str.trim();
        if !filter_str.is_empty() {
            let parts: Vec<&str> = filter_str.split(':').collect();
            if parts.len() != 3 {
                return Err(Error::custom(format!(
                    "Invalid filter format: '{}'. Expected 'field:operator:value'",
                    filter_str
                )));
            }

            let field = parts[0].to_string();
            let operator = FilterOperator::from_str(parts[1])
                .map_err(|e| Error::custom(e))?;
            let value = FilterValue::String(parts[2].to_string());

            filters.push(Filter::new(field, operator, value));
        }
    }

    Ok(filters)
}

struct ParsedField<'a> {
    config: &'a FieldConfig,
    field: String,
    json_key: Option<String>,
}

fn parse_field<'a>(
    field_name: &str,
    field_configs: &'a HashMap<String, FieldConfig>,
) -> Result<ParsedField<'a>, String> {
    if let Some(config) = field_configs.get(field_name) {
        return Ok(ParsedField {
            config,
            field: field_name.to_string(),
            json_key: None,
        });
    }

    let Some(dot_pos) = field_name.find('.') else {
        return Err(format!("Unknown field: {}", field_name));
    };

    let base_field = &field_name[..dot_pos];
    let key = &field_name[dot_pos + 1..];
    
    let Some(config) = field_configs.get(base_field) else {
        return Err(format!("Unknown field: {}", field_name));
    };

    if config.field_type != FieldType::Json {
        return Err(format!("Field '{}' does not support dot notation (not a JSON field)", base_field));
    }

    Ok(ParsedField {
        config,
        field: base_field.to_string(),
        json_key: Some(key.to_string()),
    })
}

pub fn validate_and_convert_filters(
    raw_filters: &[Filter],
    field_configs: &HashMap<String, FieldConfig>,
) -> Result<Vec<Filter>, Error> {
    let mut validated_filters = Vec::new();

    for raw_filter in raw_filters {
        let parsed_field = parse_field(&raw_filter.field, field_configs)
            .map_err(|e| Error::BadRequest(e))?;

        // Convert string value to proper type
        let converted_value = if let FilterValue::String(s) = &raw_filter.value {
            if let Some(key) = parsed_field.json_key {
                // This is a JSON field, create JSON filter value
                FilterValue::Json { key, value: s.clone() }
            } else {
                // Regular field conversion
                FilterValue::from_string(s, &parsed_field.config.field_type)
                    .map_err(|e| Error::BadRequest(format!("Field '{}': {}", parsed_field.field, e)))?
            }
        } else {
            raw_filter.value.clone()
        };

        let filter = Filter::new(
            parsed_field.field,
            raw_filter.operator.clone(),
            converted_value,
        );

        filter.validate(field_configs)
            .map_err(|e| Error::BadRequest(e))?;

        validated_filters.push(filter);
    }

    Ok(validated_filters)
}

#[cfg(test)]
mod tests {
    use crate::db::filters::{FieldType, FilterOperator, FilterValue};

    #[test]
    fn test_field_type_operator_validation() {
        assert!(FieldType::String.allows_operator(&FilterOperator::Eq));
        assert!(FieldType::String.allows_operator(&FilterOperator::ILike));
        assert!(FieldType::String.allows_operator(&FilterOperator::NotILike));
        assert!(!FieldType::String.allows_operator(&FilterOperator::Gte));

        assert!(FieldType::Integer.allows_operator(&FilterOperator::Gte));
        assert!(!FieldType::Integer.allows_operator(&FilterOperator::ILike));
        
        assert!(FieldType::Boolean.allows_operator(&FilterOperator::Eq));
        assert!(!FieldType::Boolean.allows_operator(&FilterOperator::Gte));
        assert!(!FieldType::Boolean.allows_operator(&FilterOperator::ILike));

        assert!(FieldType::Enum.allows_operator(&FilterOperator::Eq));
        assert!(!FieldType::Enum.allows_operator(&FilterOperator::Gte));
        assert!(!FieldType::Enum.allows_operator(&FilterOperator::ILike));

        assert!(FieldType::Uuid.allows_operator(&FilterOperator::Eq));
        assert!(FieldType::Uuid.allows_operator(&FilterOperator::Neq));
        assert!(!FieldType::Uuid.allows_operator(&FilterOperator::ILike));
        assert!(!FieldType::Uuid.allows_operator(&FilterOperator::NotILike));

        assert!(FieldType::Json.allows_operator(&FilterOperator::Eq));
        assert!(FieldType::Json.allows_operator(&FilterOperator::Neq));
        assert!(!FieldType::Json.allows_operator(&FilterOperator::ILike));
        assert!(!FieldType::Json.allows_operator(&FilterOperator::Gt));
    }

    #[test]
    fn test_json_filter_parsing() {
        let field_type = FieldType::Json;
        let result = FilterValue::from_string("environment=production", &field_type);
        assert!(result.is_ok());
        
        if let Ok(FilterValue::Json { key, value }) = result {
            assert_eq!(key, "environment");
            assert_eq!(value, "production");
        } else {
            panic!("Expected JSON filter value");
        }
        
        let invalid_result = FilterValue::from_string("invalid_format", &field_type);
        assert!(invalid_result.is_err());
    }
}