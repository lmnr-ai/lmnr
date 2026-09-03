//! Tier-based data retention (LAM-2199).
//!
//! Two halves that must agree:
//! - **Write side**: every row written to a TTL'd table (`traces_agg`,
//!   `traces_static`, `deduped_content`) carries an `expires_at` computed here
//!   from the workspace tier. ClickHouse drops the row at the next merge after
//!   that instant. Tiers without a retention window (enterprise / self-hosted)
//!   write [`NEVER_EXPIRES`].
//! - **Read side**: the SQL validator clamps every time-parameterized view's
//!   lower bound to [`retention_cutoff_for_project`], so rows that are expired
//!   but not yet merged away are never returned.
//!
//! `expires_at` is padded by [`RETENTION_GRACE_DAYS`] past the read cutoff so a
//! row is always hidden before it is physically deleted, never the reverse.

use std::{collections::HashMap, sync::Arc};

use chrono::{DateTime, Duration, Utc};
use uuid::Uuid;

use crate::{
    cache::Cache,
    db::DB,
    features::{Feature, is_feature_enabled},
    utils::limits::get_workspace_info_for_project_id,
};

/// `2106-01-01 00:00:00 UTC`: the DDL default for `expires_at`, chosen to sit
/// inside `DateTime`'s 32-bit range while never being reached by a merge.
pub const NEVER_EXPIRES: u32 = 4_291_747_200;

/// `#[serde(default = ...)]` hook for rows deserialized without `expires_at`.
pub fn never_expires() -> u32 {
    NEVER_EXPIRES
}

/// Days a row stays on disk past the tier's read cutoff.
pub const RETENTION_GRACE_DAYS: u32 = 7;

const SECS_PER_DAY: i64 = 86_400;
const NANOS_PER_SEC: i64 = 1_000_000_000;

/// `expires_at` (unix seconds) for a row anchored at `base_time_ns`, or
/// [`NEVER_EXPIRES`] when the tier keeps data indefinitely.
pub fn expires_at(base_time_ns: i64, retention_days: Option<u32>) -> u32 {
    let Some(days) = retention_days else {
        return NEVER_EXPIRES;
    };
    let base_secs = base_time_ns.div_euclid(NANOS_PER_SEC);
    let expiry = base_secs + (days as i64 + RETENTION_GRACE_DAYS as i64) * SECS_PER_DAY;
    expiry.clamp(0, NEVER_EXPIRES as i64) as u32
}

/// The project's retention window in days; `None` when data is kept forever
/// (usage limits disabled, unknown tier, or the lookup failed — failing open
/// keeps ingest from dropping rows over a transient billing-info error).
pub async fn project_retention_days(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Option<u32> {
    if !is_feature_enabled(Feature::UsageLimit) {
        return None;
    }
    match get_workspace_info_for_project_id(db, cache, project_id).await {
        Ok(Some(info)) => info.tier_name.retention_days(),
        Ok(None) => None,
        Err(e) => {
            log::warn!("Failed to resolve retention for project {project_id}, keeping rows: {e:?}");
            None
        }
    }
}

/// One lookup per distinct project in an ingest batch.
pub async fn retention_days_by_project(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_ids: impl IntoIterator<Item = Uuid>,
) -> HashMap<Uuid, Option<u32>> {
    let mut by_project = HashMap::new();
    for project_id in project_ids {
        if by_project.contains_key(&project_id) {
            continue;
        }
        let days = project_retention_days(db.clone(), cache.clone(), project_id).await;
        by_project.insert(project_id, days);
    }
    by_project
}

/// Earliest instant the project may read back to, or `None` when unbounded.
pub async fn retention_cutoff_for_project(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
) -> Option<DateTime<Utc>> {
    let days = project_retention_days(db, cache, project_id).await?;
    Some(Utc::now() - Duration::days(days as i64))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_retention_never_expires() {
        assert_eq!(
            expires_at(1_700_000_000 * NANOS_PER_SEC, None),
            NEVER_EXPIRES
        );
    }

    #[test]
    fn expiry_is_base_plus_retention_plus_grace() {
        let base_secs = 1_700_000_000;
        let got = expires_at(base_secs * NANOS_PER_SEC + 123, Some(7));
        let expected = base_secs + (7 + RETENTION_GRACE_DAYS as i64) * SECS_PER_DAY;
        assert_eq!(got as i64, expected);
    }

    #[test]
    fn expiry_is_clamped_into_datetime_range() {
        assert_eq!(expires_at(i64::MAX, Some(30)), NEVER_EXPIRES);
        assert_eq!(expires_at(i64::MIN, Some(30)), 0);
    }
}
