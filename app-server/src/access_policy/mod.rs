//! Role-derived read restrictions for the ClickHouse `_v1` views
//! (docs/internal/rbac.md).
//!
//! The query engine injects [`AccessPolicy`] as the `policy` JSON argument of
//! `spans_v1` / `traces_v1`; ClickHouse constant-folds the unrestricted case
//! (`'{}'`) back to the plain columns. No data-read path branches on a role
//! name: roles map to permissions here, permissions map to a policy, and the
//! views only ever see the policy.

use std::sync::Arc;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::MEMBER_ROLE_CACHE_KEY},
    db::{
        DB,
        projects::{PiiMode, ProjectSettings},
        workspaces::get_member_role,
    },
    utils::limits::get_workspace_info_for_project_id,
};

/// Role changes propagate through the frontend's explicit invalidation;
/// the TTL only bounds staleness if that call is lost.
const MEMBER_ROLE_TTL_SECONDS: u64 = 60 * 60;

/// Who is reading. Sent by the frontend on every `/sql/query` and
/// `/sql/validate` call; the route rejects requests without one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Actor {
    /// A signed-in user; the policy follows their workspace role.
    User {
        #[serde(rename = "userId")]
        user_id: Uuid,
    },
    /// A public share-link viewer: gets the most restrictive policy.
    Shared,
}

/// Restrictions the views apply. Serialized as the `policy` view argument;
/// only set restrictions are written so the unrestricted policy is `{}`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessPolicy {
    /// Splice `[REDACTED_<LABEL>]` over the stored PII masks instead of
    /// showing raw span text; rows the redactor never screened render as
    /// unavailable.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub mask_pii: bool,
    /// Row-level scope: a span or trace is visible only if its trace
    /// satisfies every filter (AND). Evaluated by the `trace_visible` UDF
    /// against `traces_static` (`spans_v1` resolves the trace through
    /// `trace_access_policy_dict`). A trace with no `traces_static` row, or
    /// without the filtered value, compares as `''`: `eq` hides it, `ne`
    /// shows it. No caller sets these yet.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub trace_filters: Vec<TraceFilter>,
}

impl AccessPolicy {
    pub const UNRESTRICTED: Self = Self {
        mask_pii: false,
        trace_filters: Vec::new(),
    };

    /// JSON literal passed as the `policy` view argument.
    pub fn to_view_arg(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
    }
}

/// One trace-level predicate. Same `column` / `operator` / `value` shape as
/// the UI's `Filter` (`frontend/lib/actions/common/filter-schemas.ts`,
/// `db::utils::Filter`) so a stored filter converts one-to-one; only the
/// operators the UDF implements are representable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TraceFilter {
    pub column: TraceFilterColumn,
    /// Metadata key to compare; `None` for scalar columns.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    pub operator: TraceFilterOperator,
    /// Compared as a string. Metadata values that are not JSON strings are
    /// compared against their raw JSON (`false`, `42`).
    pub value: String,
}

// Only `for_actor` builds policies today and it never scopes rows; these are
// the constructors the role/API-key → policy mapping will use.
#[cfg_attr(not(test), allow(dead_code))]
impl TraceFilter {
    pub fn user_id(operator: TraceFilterOperator, value: impl Into<String>) -> Self {
        Self {
            column: TraceFilterColumn::UserId,
            key: None,
            operator,
            value: value.into(),
        }
    }

    pub fn metadata(
        key: impl Into<String>,
        operator: TraceFilterOperator,
        value: impl Into<String>,
    ) -> Self {
        Self {
            column: TraceFilterColumn::Metadata,
            key: Some(key.into()),
            operator,
            value: value.into(),
        }
    }
}

/// Trace columns a filter may target (`traces_v1` column names).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(not(test), allow(dead_code))]
pub enum TraceFilterColumn {
    UserId,
    Metadata,
}

/// Subset of `db::utils::FilterOperator` the `trace_visible` UDF implements.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(not(test), allow(dead_code))]
pub enum TraceFilterOperator {
    Eq,
    Ne,
}

/// What a workspace role may do. Built-in defaults only; a per-workspace
/// override table is the planned extension point.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RolePermissions {
    pub view_pii: bool,
}

/// `None` is a non-member (or an unknown role) and gets member permissions.
pub fn permissions_for_role(role: Option<&str>) -> RolePermissions {
    match role {
        Some("owner") | Some("admin") => RolePermissions { view_pii: true },
        _ => RolePermissions { view_pii: false },
    }
}

/// Policy for `actor` reading `project_id`. Fails closed: any lookup error
/// yields the restricted policy rather than an unrestricted one.
pub async fn for_actor(
    actor: &Actor,
    project_id: Uuid,
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> Result<AccessPolicy> {
    let project = get_workspace_info_for_project_id(db.clone(), cache.clone(), project_id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("project {project_id} not found"))?;
    if !stores_dual_copies(&project.settings) {
        return Ok(AccessPolicy::UNRESTRICTED);
    }
    let permissions = match actor {
        Actor::Shared => permissions_for_role(None),
        Actor::User { user_id } => {
            let role = cached_member_role(project.workspace_id, *user_id, &db, &cache).await;
            permissions_for_role(role.as_deref())
        }
    };
    Ok(AccessPolicy {
        mask_pii: !permissions.view_pii,
        ..Default::default()
    })
}

/// Only `dual` stores something the policy can hide (raw text next to its
/// masks); `off` and `redact` have one text that everyone sees. The
/// configured mode decides, not the flag-degraded `effective_pii_mode()`:
/// rows written while the flag was on still hold raw text, so turning the
/// flag off must not unmask them.
fn stores_dual_copies(settings: &ProjectSettings) -> bool {
    settings.pii_mode() == PiiMode::Dual
}

/// Cached `members_of_workspaces.member_role`. Non-membership is not cached
/// (a freshly added member should see their role immediately) and a lookup
/// failure reads as non-member.
async fn cached_member_role(
    workspace_id: Uuid,
    user_id: Uuid,
    db: &DB,
    cache: &Cache,
) -> Option<String> {
    let key = format!("{MEMBER_ROLE_CACHE_KEY}:{workspace_id}:{user_id}");
    if let Ok(Some(role)) = cache.get::<String>(&key).await {
        return Some(role);
    }
    let role = match get_member_role(&db.pool, workspace_id, user_id).await {
        Ok(role) => role,
        Err(e) => {
            log::warn!("member role lookup failed for {user_id} in {workspace_id}: {e:#}");
            return None;
        }
    };
    if let Some(role) = role.as_ref()
        && let Err(e) = cache
            .insert_with_ttl::<String>(&key, role.clone(), MEMBER_ROLE_TTL_SECONDS)
            .await
    {
        log::warn!("member role cache write failed: {e}");
    }
    role
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dual_stays_maskable_while_the_flag_is_off() {
        // Tests run without PII_DUAL_MODE_ENABLED, so `effective_pii_mode()`
        // degrades to `redact`; the read policy must still treat the project
        // as dual so raw rows written earlier stay masked.
        let dual: ProjectSettings = serde_json::from_str(r#"{"piiMode":"dual"}"#).unwrap();
        assert_eq!(dual.effective_pii_mode(), PiiMode::Redact);
        assert!(stores_dual_copies(&dual));

        let redact: ProjectSettings = serde_json::from_str(r#"{"piiMode":"redact"}"#).unwrap();
        assert!(!stores_dual_copies(&redact));
        let legacy: ProjectSettings = serde_json::from_str(r#"{"removePii":true}"#).unwrap();
        assert!(!stores_dual_copies(&legacy));
    }

    #[test]
    fn unrestricted_policy_serializes_to_empty_object() {
        assert_eq!(AccessPolicy::UNRESTRICTED.to_view_arg(), "{}");
        assert_eq!(AccessPolicy::default().to_view_arg(), "{}");
    }

    #[test]
    fn masking_policy_serializes_camel_case() {
        assert_eq!(
            AccessPolicy {
                mask_pii: true,
                ..Default::default()
            }
            .to_view_arg(),
            r#"{"maskPii":true}"#
        );
    }

    #[test]
    fn trace_filters_serialize_in_the_ui_filter_shape() {
        // Read by the `trace_visible` UDF as
        // `Array(Tuple(column String, key String, operator String, value String))`;
        // a missing `key` extracts as `''` there.
        let policy = AccessPolicy {
            mask_pii: true,
            trace_filters: vec![
                TraceFilter::user_id(TraceFilterOperator::Eq, "u-1"),
                TraceFilter::metadata("sensitive", TraceFilterOperator::Ne, "true"),
            ],
        };
        assert_eq!(
            policy.to_view_arg(),
            r#"{"maskPii":true,"traceFilters":[{"column":"user_id","operator":"eq","value":"u-1"},{"column":"metadata","key":"sensitive","operator":"ne","value":"true"}]}"#
        );
        // Filters alone: `maskPii` is omitted, not written as `false`.
        let scoped = AccessPolicy {
            trace_filters: vec![TraceFilter::user_id(TraceFilterOperator::Eq, "it's")],
            ..Default::default()
        };
        assert_eq!(
            scoped.to_view_arg(),
            r#"{"traceFilters":[{"column":"user_id","operator":"eq","value":"it's"}]}"#
        );
    }

    #[test]
    fn admins_and_owners_see_pii_everyone_else_does_not() {
        assert!(permissions_for_role(Some("owner")).view_pii);
        assert!(permissions_for_role(Some("admin")).view_pii);
        assert!(!permissions_for_role(Some("member")).view_pii);
        assert!(!permissions_for_role(Some("auditor")).view_pii);
        assert!(!permissions_for_role(None).view_pii);
    }

    #[test]
    fn actor_deserializes_from_frontend_shape() {
        let user: Actor = serde_json::from_str(
            r#"{"type":"user","userId":"00000000-0000-0000-0000-000000000001"}"#,
        )
        .unwrap();
        assert_eq!(
            user,
            Actor::User {
                user_id: Uuid::from_u128(1)
            }
        );
        let shared: Actor = serde_json::from_str(r#"{"type":"shared"}"#).unwrap();
        assert_eq!(shared, Actor::Shared);
        assert!(serde_json::from_str::<Actor>(r#"{"type":"admin"}"#).is_err());
    }
}
