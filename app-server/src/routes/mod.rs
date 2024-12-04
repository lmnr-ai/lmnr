pub mod api_keys;
pub mod auth;
pub mod datasets;
pub mod error;
pub mod evaluations;
pub mod labels;
pub mod limits;
pub mod pipelines;
pub mod projects;
pub mod provider_api_keys;
pub mod subscriptions;
pub mod traces;
pub mod types;
pub mod workspace;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use types::*;

use crate::{
    ch::{modifiers::GroupByInterval, Aggregation},
    db::modifiers::DateRange,
};

pub const DEFAULT_PAGE_SIZE: usize = 50;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedGetQueryParams {
    /// page number starting from 0
    #[serde(default)]
    pub page_number: usize,
    /// number of items per page
    #[serde(default)]
    pub page_size: Option<usize>,
    /// JSON array of filters
    #[serde(default)]
    pub filter: Value,
    /// absolute or relative date range
    #[serde(default, flatten)]
    pub date_range: Option<DateRange>,
    /// search query
    #[serde(default)]
    pub search: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResponse<T> {
    pub total_count: u64,
    pub items: Vec<T>,
    /// returns true if there are any items of type `T` in the project.
    /// This is useful because `total_count` only counts items that match the filter.
    pub any_in_project: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetMetricsQueryParams {
    /// Total or average
    pub aggregation: Aggregation,
    /// Date range per page
    #[serde(default, flatten)]
    pub date_range: Option<DateRange>,
    /// Time interval for grouping
    #[serde(default)]
    pub group_by_interval: GroupByInterval,
}
