pub mod error;
pub mod evaluations;
pub mod probes;
pub mod realtime;
pub mod spans;
pub mod sql;
pub mod types;
use serde::Serialize;
use types::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResponse<T> {
    pub total_count: u64,
    pub items: Vec<T>,
    /// returns true if there are any items of type `T` in the project.
    /// This is useful because `total_count` only counts items that match the filter.
    pub any_in_project: bool,
}
