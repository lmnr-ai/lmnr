use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Clone, Serialize, Deserialize)]
pub struct WorkspaceLimitsExceeded {
    pub steps: bool,
    pub bytes_ingested: bool,
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStats {
    pub storage_mib: Option<f64>,
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStats {
    pub tier_name: String,
    pub seats_included_in_tier: i64,
    pub total_spans: i64,
    pub spans_this_month: i64,
    pub total_steps: i64,
    pub steps_this_month: i64,
    pub spans_limit: i64,
    pub steps_limit: i64,
    pub spans_over_limit: i64,
    pub steps_over_limit: i64,
    // TODO: fetch this from stripe meters once they are configured
    pub spans_over_limit_cost: f64,
    pub steps_over_limit_cost: f64,

    pub members: i64,
    pub members_limit: i64,
    pub reset_time: DateTime<Utc>,
    pub storage_limit: i64,
}
