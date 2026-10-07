//! Native query-structure types for the in-process query engine.
//!
//! These replace the protobuf-generated types that used to flow over gRPC to
//! the Python query-engine service. The serde shape MUST match the frontend
//! contract in `frontend/lib/actions/sql/types.ts` (camelCase, `stringValue` /
//! `numberValue` flattened onto the filter, `args` defaulting to `[]`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Metric {
    pub r#fn: String,
    pub column: String,
    #[serde(default)]
    pub args: Vec<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FilterValue {
    StringValue(String),
    NumberValue(f64),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Filter {
    pub field: String,
    pub op: String,
    #[serde(flatten)]
    pub value: Option<FilterValue>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRange {
    pub column: String,
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub interval_unit: String,
    #[serde(default)]
    pub interval_value: String,
    #[serde(default)]
    pub fill_gaps: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderBy {
    pub field: String,
    pub dir: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryStructure {
    pub table: String,
    #[serde(default)]
    pub metrics: Vec<Metric>,
    #[serde(default)]
    pub dimensions: Vec<String>,
    #[serde(default)]
    pub filters: Vec<Filter>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_range: Option<TimeRange>,
    #[serde(default)]
    pub order_by: Vec<OrderBy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<i32>,
}
