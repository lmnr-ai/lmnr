//! Workspace LLM profile CRUD shared by the internal (frontend), project-API-key
//! and CLI routes. Owns persistence, model diffing, cache invalidation and error
//! mapping; routes only translate auth and HTTP. Input rules live in `validate`,
//! secret pruning/merging/masking in `secrets`.
//!
//! Secrets arrive in plaintext (server-to-server or TLS) and leave only as
//! `first3***last3` masks.

use std::collections::HashSet;

use actix_web::HttpResponse;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait, keys::LLM_PROFILE_CACHE_KEY};
use crate::data_plane::crypto;
use crate::db::{llm_profiles, projects};
use crate::features::{Feature, is_feature_enabled};

use super::{
    EncryptedSecrets, LlmProfile, LlmProfileProvider, ProfileConfig, ProfileSecrets,
    build::decrypt_secrets,
};

mod secrets;
mod validate;

pub use secrets::SecretsPresence;
use secrets::{assert_secrets_complete, merge_secrets, presence, prune_secrets};
use validate::{normalize_config, validate_models, validate_name, validate_secret_values};

#[derive(Debug, thiserror::Error)]
pub enum CrudError {
    #[error("{0}")]
    Validation(String),
    #[error("An LLM profile named \"{0}\" already exists in this workspace")]
    DuplicateName(String),
    #[error("LLM profile not found")]
    NotFound,
    /// A delete or model removal blocked by the RESTRICT FK from `signals`.
    #[error("{0}")]
    InUse(String),
    #[error("LLM profiles are not available on this deployment")]
    Unavailable,
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

pub fn error_response(e: CrudError) -> HttpResponse {
    match e {
        CrudError::Validation(m) => HttpResponse::BadRequest().json(json!({ "error": m })),
        e @ (CrudError::DuplicateName(_) | CrudError::InUse(_)) => {
            HttpResponse::Conflict().json(json!({ "error": e.to_string() }))
        }
        e @ (CrudError::NotFound | CrudError::Unavailable) => {
            HttpResponse::NotFound().json(json!({ "error": e.to_string() }))
        }
        CrudError::Internal(err) => {
            log::error!("LLM profile crud error: {err:?}");
            HttpResponse::InternalServerError().json(json!({ "error": "Internal server error" }))
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLlmProfileInput {
    pub name: String,
    pub provider: LlmProfileProvider,
    #[serde(default)]
    pub config: ProfileConfig,
    #[serde(default)]
    pub secrets: ProfileSecrets,
    pub models: Vec<String>,
}

/// Every field optional; omitted ones keep their stored value. `secrets` is an
/// overlay: a key that is absent keeps the stored secret, so callers never have
/// to re-send credentials. `models` replaces the whole list when present.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLlmProfileInput {
    pub name: Option<String>,
    pub provider: Option<LlmProfileProvider>,
    pub config: Option<ProfileConfig>,
    #[serde(default)]
    pub secrets: ProfileSecrets,
    pub models: Option<Vec<String>>,
}

/// "Test connection" input: a draft, optionally layered over a saved profile's
/// secrets so the user can re-test without retyping the key.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeLlmProfileInput {
    pub profile_id: Option<Uuid>,
    pub provider: LlmProfileProvider,
    #[serde(default)]
    pub config: ProfileConfig,
    #[serde(default)]
    pub secrets: ProfileSecrets,
    pub model: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProfileResponse {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub provider: LlmProfileProvider,
    pub config: ProfileConfig,
    pub models: Vec<String>,
    pub secrets: SecretsPresence,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl LlmProfileResponse {
    fn new(profile: LlmProfile, secrets: &ProfileSecrets) -> Self {
        Self {
            id: profile.id,
            workspace_id: profile.workspace_id,
            name: profile.name,
            provider: profile.provider,
            config: profile.config,
            models: profile.models,
            secrets: presence(secrets),
            created_at: profile.created_at,
            updated_at: profile.updated_at,
        }
    }
}

/// Project-scoped callers (API key, CLI) act on the project's workspace.
pub async fn workspace_for_project(pool: &PgPool, project_id: Uuid) -> Result<Uuid, CrudError> {
    projects::get_project_workspace_id(pool, project_id)
        .await
        .map_err(CrudError::Internal)?
        .ok_or_else(|| CrudError::Internal(anyhow::anyhow!("project {project_id} not found")))
}

fn ensure_enabled() -> Result<(), CrudError> {
    if is_feature_enabled(Feature::LlmProfiles) {
        Ok(())
    } else {
        Err(CrudError::Unavailable)
    }
}

pub async fn list_llm_profiles(
    pool: &PgPool,
    workspace_id: Uuid,
) -> Result<Vec<LlmProfileResponse>, CrudError> {
    ensure_enabled()?;
    let profiles = llm_profiles::list_llm_profiles(pool, workspace_id)
        .await
        .map_err(CrudError::Internal)?;
    profiles.into_iter().map(describe).collect()
}

pub async fn get_llm_profile(
    pool: &PgPool,
    workspace_id: Uuid,
    profile_id: Uuid,
) -> Result<LlmProfileResponse, CrudError> {
    ensure_enabled()?;
    describe(load(pool, workspace_id, profile_id).await?)
}

pub async fn create_llm_profile(
    pool: &PgPool,
    workspace_id: Uuid,
    input: CreateLlmProfileInput,
) -> Result<LlmProfileResponse, CrudError> {
    ensure_enabled()?;
    let name = validate_name(&input.name)?;
    let models = validate_models(input.models)?;
    let config = normalize_config(input.provider, input.config)?;
    validate_secret_values(&input.secrets)?;
    let secrets = prune_secrets(input.provider, &config, input.secrets);
    assert_secrets_complete(input.provider, &config, &secrets)?;

    // The AEAD AAD is the profile id, so the id is minted before encryption.
    let id = Uuid::new_v4();
    let encrypted = encrypt_secrets(id, &secrets)?;

    let mut tx = pool.begin().await.map_err(internal)?;
    llm_profiles::insert_llm_profile(
        &mut tx,
        id,
        workspace_id,
        &name,
        input.provider.wire_name(),
        &to_json(&config)?,
        &to_json(&encrypted)?,
    )
    .await
    .map_err(|e| map_write_error(e, &name))?;
    llm_profiles::insert_llm_profile_models(&mut tx, id, &models)
        .await
        .map_err(internal)?;
    tx.commit().await.map_err(internal)?;

    let profile = load(pool, workspace_id, id).await?;
    Ok(LlmProfileResponse::new(profile, &secrets))
}

pub async fn update_llm_profile(
    pool: &PgPool,
    cache: &Cache,
    workspace_id: Uuid,
    profile_id: Uuid,
    input: UpdateLlmProfileInput,
) -> Result<LlmProfileResponse, CrudError> {
    ensure_enabled()?;
    let existing = load(pool, workspace_id, profile_id).await?;

    let name = input.name.as_deref().map(validate_name).transpose()?;
    let models = input.models.map(validate_models).transpose()?;
    let provider = input.provider.unwrap_or(existing.provider);
    let config = match (input.provider, input.config) {
        (Some(_), None) => {
            return Err(CrudError::Validation(
                "config is required when provider changes".to_string(),
            ));
        }
        (_, Some(config)) => normalize_config(provider, config)?,
        (None, None) => existing.config.clone(),
    };

    validate_secret_values(&input.secrets)?;
    let stored = decrypt_stored(&existing)?;
    let secrets = prune_secrets(provider, &config, merge_secrets(stored, input.secrets));
    assert_secrets_complete(provider, &config, &secrets)?;
    let encrypted = encrypt_secrets(profile_id, &secrets)?;

    let mut tx = pool.begin().await.map_err(internal)?;
    let found = llm_profiles::update_llm_profile(
        &mut tx,
        workspace_id,
        profile_id,
        name.as_deref(),
        provider.wire_name(),
        &to_json(&config)?,
        &to_json(&encrypted)?,
    )
    .await
    .map_err(|e| map_write_error(e, name.as_deref().unwrap_or(&existing.name)))?;
    if !found {
        return Err(CrudError::NotFound);
    }
    if let Some(models) = &models {
        // Delete only the models that went away so the RESTRICT FK fires for in-use ones.
        let current = llm_profiles::get_llm_profile_model_names(&mut tx, profile_id)
            .await
            .map_err(internal)?;
        let wanted: HashSet<&str> = models.iter().map(String::as_str).collect();
        let current_set: HashSet<&str> = current.iter().map(String::as_str).collect();
        let removed: Vec<String> = current
            .iter()
            .filter(|m| !wanted.contains(m.as_str()))
            .cloned()
            .collect();
        let added: Vec<String> = models
            .iter()
            .filter(|m| !current_set.contains(m.as_str()))
            .cloned()
            .collect();
        llm_profiles::delete_llm_profile_models(&mut tx, profile_id, &removed)
            .await
            .map_err(|e| match pg_code(&e).as_deref() {
                Some(PG_FK_VIOLATION) => CrudError::InUse(
                    "A removed model is used by a signal and cannot be dropped from this profile"
                        .to_string(),
                ),
                _ => internal(e),
            })?;
        llm_profiles::insert_llm_profile_models(&mut tx, profile_id, &added)
            .await
            .map_err(internal)?;
    }
    tx.commit().await.map_err(internal)?;

    invalidate(cache, workspace_id, profile_id).await;
    let profile = load(pool, workspace_id, profile_id).await?;
    Ok(LlmProfileResponse::new(profile, &secrets))
}

pub async fn delete_llm_profile(
    pool: &PgPool,
    cache: &Cache,
    workspace_id: Uuid,
    profile_id: Uuid,
) -> Result<LlmProfileResponse, CrudError> {
    ensure_enabled()?;
    let existing = load(pool, workspace_id, profile_id).await?;

    let count = llm_profiles::count_signals_using_profile(pool, profile_id)
        .await
        .map_err(CrudError::Internal)?;
    if count > 0 {
        let plural = if count == 1 { "" } else { "s" };
        return Err(CrudError::InUse(format!(
            "This profile is used by {count} signal{plural} and cannot be deleted."
        )));
    }

    // The RESTRICT FK is the backstop for a signal created between the count and the delete.
    let found = llm_profiles::delete_llm_profile(pool, workspace_id, profile_id)
        .await
        .map_err(|e| match pg_code(&e).as_deref() {
            Some(PG_FK_VIOLATION) => CrudError::InUse(
                "This profile is used by a signal and cannot be deleted.".to_string(),
            ),
            _ => internal(e),
        })?;
    if !found {
        return Err(CrudError::NotFound);
    }

    invalidate(cache, workspace_id, profile_id).await;
    describe(existing)
}

/// Runs the one-token probe for a draft; a failing provider call is a result,
/// not an error, so the caller can show it under the form.
pub async fn probe_llm_profile(
    pool: &PgPool,
    workspace_id: Uuid,
    input: ProbeLlmProfileInput,
) -> Result<Result<std::time::Duration, String>, CrudError> {
    ensure_enabled()?;
    let model = input.model.trim().to_string();
    if model.is_empty() {
        return Err(CrudError::Validation("model is required".to_string()));
    }
    let config = normalize_config(input.provider, input.config)?;
    validate_secret_values(&input.secrets)?;

    let stored = match input.profile_id {
        Some(profile_id) => {
            let existing = load(pool, workspace_id, profile_id).await?;
            decrypt_stored(&existing)?
        }
        None => ProfileSecrets::default(),
    };
    let secrets = prune_secrets(
        input.provider,
        &config,
        merge_secrets(stored, input.secrets),
    );
    assert_secrets_complete(input.provider, &config, &secrets)?;

    // Unnamed and never persisted; `build_client` decrypts, so encrypt under a throwaway id.
    let id = Uuid::new_v4();
    let now = Utc::now();
    let draft = LlmProfile {
        id,
        workspace_id,
        name: String::new(),
        provider: input.provider,
        config,
        secrets: encrypt_secrets(id, &secrets)?,
        models: vec![model.clone()],
        created_at: now,
        updated_at: now,
    };
    Ok(super::probe(&draft, &model)
        .await
        .map_err(|e| e.to_string()))
}

async fn load(
    pool: &PgPool,
    workspace_id: Uuid,
    profile_id: Uuid,
) -> Result<LlmProfile, CrudError> {
    llm_profiles::get_llm_profile(pool, workspace_id, profile_id)
        .await
        .map_err(CrudError::Internal)?
        .ok_or(CrudError::NotFound)
}

fn describe(profile: LlmProfile) -> Result<LlmProfileResponse, CrudError> {
    let secrets = decrypt_stored(&profile)?;
    Ok(LlmProfileResponse::new(profile, &secrets))
}

fn decrypt_stored(profile: &LlmProfile) -> Result<ProfileSecrets, CrudError> {
    decrypt_secrets(profile).map_err(|e| CrudError::Internal(anyhow::anyhow!("{e}")))
}

async fn invalidate(cache: &Cache, workspace_id: Uuid, profile_id: Uuid) {
    let key = format!("{LLM_PROFILE_CACHE_KEY}:{workspace_id}:{profile_id}");
    if let Err(e) = cache.remove(&key).await {
        log::error!("Failed to invalidate LLM profile cache {key}: {e:?}");
    }
}

fn encrypt_secrets(id: Uuid, secrets: &ProfileSecrets) -> Result<EncryptedSecrets, CrudError> {
    let raw = serde_json::to_string(secrets).map_err(internal)?;
    let (nonce, value) = crypto::encrypt(&id.to_string(), &raw).map_err(CrudError::Internal)?;
    Ok(EncryptedSecrets { nonce, value })
}

fn to_json<T: Serialize>(value: &T) -> Result<serde_json::Value, CrudError> {
    serde_json::to_value(value).map_err(internal)
}

fn internal<E: std::error::Error + Send + Sync + 'static>(e: E) -> CrudError {
    CrudError::Internal(anyhow::Error::new(e))
}

const PG_UNIQUE_VIOLATION: &str = "23505";
const PG_FK_VIOLATION: &str = "23503";

fn pg_code(e: &sqlx::Error) -> Option<String> {
    match e {
        sqlx::Error::Database(db) => db.code().map(|c| c.to_string()),
        _ => None,
    }
}

fn map_write_error(e: sqlx::Error, name: &str) -> CrudError {
    match pg_code(&e).as_deref() {
        Some(PG_UNIQUE_VIOLATION) => CrudError::DuplicateName(name.to_string()),
        _ => internal(e),
    }
}
