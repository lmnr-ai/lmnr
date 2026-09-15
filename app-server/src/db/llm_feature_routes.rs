//! `llm_feature_routes`: which workspace LLM profile + model serves an LLM
//! feature. `workspace_id IS NULL` rows are the global routes (Laminar Cloud
//! prod), scoped by `UNIQUE NULLS NOT DISTINCT (workspace_id, feature_id)`.
//! Rows are written directly in the database; the app only reads them.

use anyhow::Result;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

/// The resolver's view of one route: enough to load the profile by
/// `(workspace, id)` and pick the model.
#[derive(Debug, Clone, FromRow, serde::Serialize, serde::Deserialize)]
pub struct FeatureRouteTarget {
    pub profile_id: Uuid,
    /// The profile's own workspace — for a global route this is the system
    /// workspace, not the caller's.
    pub profile_workspace_id: Uuid,
    pub model: String,
}

/// The single most specific row among the four that can apply: the workspace's
/// `feature_id` row, its `default_feature_id` row, then the same two global
/// (`workspace_id IS NULL`) rows. `workspace_id = None` considers only the
/// global rows. One round trip; the precedence is the `ORDER BY`.
pub async fn resolve_route(
    pool: &PgPool,
    workspace_id: Option<Uuid>,
    feature_id: &str,
    default_feature_id: &str,
) -> Result<Option<FeatureRouteTarget>> {
    let row = sqlx::query_as::<_, FeatureRouteTarget>(
        "SELECT
            r.llm_profile_id AS profile_id,
            p.workspace_id AS profile_workspace_id,
            r.model_name AS model
        FROM llm_feature_routes r
        JOIN llm_profiles p ON p.id = r.llm_profile_id
        WHERE (r.workspace_id = $1 OR r.workspace_id IS NULL)
            AND r.feature_id IN ($2, $3)
        ORDER BY r.workspace_id IS NULL, r.feature_id = $3
        LIMIT 1",
    )
    .bind(workspace_id)
    .bind(feature_id)
    .bind(default_feature_id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Feature ids routed to `profile_id` (any workspace). Lets profile deletion
/// name what still depends on it.
pub async fn feature_ids_using_profile(pool: &PgPool, profile_id: Uuid) -> Result<Vec<String>> {
    let ids = sqlx::query_scalar(
        "SELECT feature_id FROM llm_feature_routes WHERE llm_profile_id = $1 ORDER BY feature_id",
    )
    .bind(profile_id)
    .fetch_all(pool)
    .await?;
    Ok(ids)
}
