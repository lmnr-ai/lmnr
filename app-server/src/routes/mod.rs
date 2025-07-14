pub mod agent;
pub mod api_keys;
pub mod datasets;
pub mod error;
pub mod evaluations;
pub mod probes;
pub mod provider_api_keys;
pub mod spans;
pub mod types;
pub mod workspace;
use serde::{Deserialize, Serialize};
use types::*;

use crate::{
    ch::{Aggregation, modifiers::GroupByInterval},
    db::modifiers::DateRange,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResponse<T> {
    pub total_count: u64,
    pub items: Vec<T>,
    /// returns true if there are any items of type `T` in the project.
    /// This is useful because `total_count` only counts items that match the filter.
    pub any_in_project: bool,
}
