//! Workspace `llm_feature_routes` writes from settings. The settings UI groups
//! feature ids ("Trace previews" = two ids), so a write names every id of the
//! group and points them all at one profile + model, or clears them.

use std::collections::BTreeSet;

use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::cache::Cache;
use crate::db::llm_feature_routes;
use crate::llm::profiles::invalidate_workspace_routes;

use super::{CrudError, PG_FK_VIOLATION, internal, load, pg_code};

/// Settings groups span at most a handful of ids; this only bounds the input.
const MAX_FEATURE_IDS: usize = 32;
const MAX_FEATURE_ID_LEN: usize = 64;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureRouteTargetInput {
    pub llm_profile_id: Uuid,
    pub model: String,
}

/// `target: None` deletes the rows, so the ids fall back to `default` / env.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetFeatureRoutesInput {
    pub feature_ids: Vec<String>,
    pub target: Option<FeatureRouteTargetInput>,
}

pub async fn set_workspace_feature_routes(
    pool: &PgPool,
    cache: &Cache,
    workspace_id: Uuid,
    input: SetFeatureRoutesInput,
) -> Result<(), CrudError> {
    let feature_ids = validate_feature_ids(input.feature_ids)?;

    let target = match input.target {
        Some(target) => Some(validate_target(pool, workspace_id, target).await?),
        None => None,
    };

    let mut tx = pool.begin().await.map_err(internal)?;
    match &target {
        Some((profile_id, model)) => {
            llm_feature_routes::upsert_workspace_routes(
                &mut tx,
                workspace_id,
                &feature_ids,
                *profile_id,
                model,
            )
            .await
            .map_err(|e| match pg_code(&e).as_deref() {
                // The profile or model went away between the check and the write.
                Some(PG_FK_VIOLATION) => CrudError::Validation(
                    "The selected LLM profile or model no longer exists".to_string(),
                ),
                _ => internal(e),
            })?;
        }
        None => {
            llm_feature_routes::delete_workspace_routes(&mut tx, workspace_id, &feature_ids)
                .await
                .map_err(internal)?;
        }
    }
    tx.commit().await.map_err(internal)?;

    invalidate_workspace_routes(cache, workspace_id, &feature_ids).await;
    Ok(())
}

/// The profile must be in the workspace and list the model; returns the
/// profile id and the trimmed model name.
async fn validate_target(
    pool: &PgPool,
    workspace_id: Uuid,
    target: FeatureRouteTargetInput,
) -> Result<(Uuid, String), CrudError> {
    let model = target.model.trim();
    if model.is_empty() {
        return Err(CrudError::Validation("model is required".to_string()));
    }
    let profile = load(pool, workspace_id, target.llm_profile_id).await?;
    if !profile.models.iter().any(|m| m == model) {
        return Err(CrudError::Validation(format!(
            "Model \"{model}\" is not part of LLM profile \"{}\"",
            profile.name
        )));
    }
    Ok((profile.id, model.to_string()))
}

/// Ids are not checked against a list: the frontend owns ids the app-server
/// never runs. Only the shape is enforced, so a malformed id cannot be stored.
fn validate_feature_ids(ids: Vec<String>) -> Result<Vec<String>, CrudError> {
    let ids: BTreeSet<String> = ids.into_iter().map(|id| id.trim().to_string()).collect();
    if ids.is_empty() {
        return Err(CrudError::Validation(
            "featureIds must not be empty".to_string(),
        ));
    }
    if ids.len() > MAX_FEATURE_IDS {
        return Err(CrudError::Validation(format!(
            "At most {MAX_FEATURE_IDS} feature ids per request"
        )));
    }
    if let Some(bad) = ids.iter().find(|id| !is_valid_feature_id(id)) {
        return Err(CrudError::Validation(format!(
            "Invalid feature id \"{bad}\""
        )));
    }
    Ok(ids.into_iter().collect())
}

fn is_valid_feature_id(id: &str) -> bool {
    id.len() <= MAX_FEATURE_ID_LEN
        && id.starts_with(|c: char| c.is_ascii_lowercase())
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feature_ids_are_trimmed_and_deduplicated() {
        let ids = validate_feature_ids(vec![
            " sql_generation ".to_string(),
            "default".to_string(),
            "sql_generation".to_string(),
        ])
        .unwrap();
        assert_eq!(ids, vec!["default", "sql_generation"]);
    }

    #[test]
    fn rejects_empty_and_malformed_ids() {
        assert!(validate_feature_ids(vec![]).is_err());
        assert!(validate_feature_ids(vec!["  ".to_string()]).is_err());
        assert!(validate_feature_ids(vec!["Sql".to_string()]).is_err());
        assert!(validate_feature_ids(vec!["1st".to_string()]).is_err());
        assert!(validate_feature_ids(vec!["a-b".to_string()]).is_err());
        assert!(validate_feature_ids(vec!["a".repeat(MAX_FEATURE_ID_LEN + 1)]).is_err());
    }

    #[test]
    fn rejects_too_many_ids() {
        let ids = (0..=MAX_FEATURE_IDS).map(|i| format!("f{i}")).collect();
        assert!(validate_feature_ids(ids).is_err());
    }
}
