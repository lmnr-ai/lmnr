//! `llm_feature_routes`: which workspace LLM profile + model serves an LLM
//! feature. `workspace_id IS NULL` rows are the global routes (Laminar Cloud
//! prod), scoped by `UNIQUE NULLS NOT DISTINCT (workspace_id, feature_id)`.
//! Workspace rows are written from settings (`profiles::service::feature_routes`);
//! global rows only directly in the database.

use anyhow::Result;
use sqlx::{FromRow, PgConnection, PgPool};
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

/// A route row with the feature id it is for, so one query can return several.
#[derive(Debug, Clone, FromRow)]
pub struct FeatureRouteRow {
    pub feature_id: String,
    #[sqlx(flatten)]
    pub target: FeatureRouteTarget,
}

/// The scope's rows for `feature_ids`, at most one per id (the unique
/// constraint). `workspace_id = None` reads the global rows.
pub async fn get_scope_routes(
    pool: &PgPool,
    workspace_id: Option<Uuid>,
    feature_ids: &[&str],
) -> Result<Vec<FeatureRouteRow>> {
    let rows = sqlx::query_as::<_, FeatureRouteRow>(
        "SELECT
            r.feature_id,
            r.llm_profile_id AS profile_id,
            p.workspace_id AS profile_workspace_id,
            r.model_name AS model
        FROM llm_feature_routes r
        JOIN llm_profiles p ON p.id = r.llm_profile_id
        WHERE r.workspace_id IS NOT DISTINCT FROM $1 AND r.feature_id = ANY($2)",
    )
    .bind(workspace_id)
    .bind(feature_ids)
    .fetch_all(pool)
    .await?;
    Ok(rows)
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

/// Points every id in `feature_ids` at `(profile_id, model)` for the workspace,
/// inserting or overwriting its rows. The composite FKs reject a profile from
/// another workspace or a model the profile does not list (23503).
pub async fn upsert_workspace_routes(
    conn: &mut PgConnection,
    workspace_id: Uuid,
    feature_ids: &[String],
    profile_id: Uuid,
    model: &str,
) -> std::result::Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO llm_feature_routes (workspace_id, feature_id, llm_profile_id, model_name)
        SELECT $1, feature_id, $3, $4 FROM UNNEST($2::text[]) AS feature_id
        ON CONFLICT ON CONSTRAINT llm_feature_routes_workspace_id_feature_id_key
        DO UPDATE SET
            llm_profile_id = EXCLUDED.llm_profile_id,
            model_name = EXCLUDED.model_name,
            updated_at = now()",
    )
    .bind(workspace_id)
    .bind(feature_ids)
    .bind(profile_id)
    .bind(model)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Removes the workspace's rows for `feature_ids`, so they fall back to the
/// workspace `default` row, then global rows, then env.
pub async fn delete_workspace_routes(
    conn: &mut PgConnection,
    workspace_id: Uuid,
    feature_ids: &[String],
) -> std::result::Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM llm_feature_routes WHERE workspace_id = $1 AND feature_id = ANY($2)")
        .bind(workspace_id)
        .bind(feature_ids)
        .execute(&mut *conn)
        .await?;
    Ok(())
}
