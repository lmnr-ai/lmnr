use std::sync::Arc;

use sqlx::PgPool;
use uuid::Uuid;

use crate::db::pipelines::PipelineVersion;
use crate::pipeline::utils::get_target_pipeline_version_cache_key;
use crate::routes::api_keys::hash_api_key;
use crate::routes::error;
use crate::{
    cache::Cache,
    db::{self, DB},
};

pub async fn query_target_pipeline_version(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: Uuid,
    pipeline_name: String,
) -> Result<Option<PipelineVersion>, error::Error> {
    let cache_key = get_target_pipeline_version_cache_key(&project_id.to_string(), &pipeline_name);
    let cache_res = cache.get::<PipelineVersion>(&cache_key).await;
    match cache_res {
        Ok(Some(pipeline_version)) => Ok(Some(pipeline_version)),
        Ok(None) | Err(_) => {
            let pipeline_version =
                db::pipelines::pipeline_version::get_target_pipeline_version_by_pipeline_name(
                    &db.pool,
                    project_id,
                    &pipeline_name,
                )
                .await?;
            if let Some(pipeline_version) = &pipeline_version {
                let _ = cache
                    .insert::<PipelineVersion>(cache_key, pipeline_version)
                    .await;
            }
            Ok(pipeline_version)
        }
    }
}

pub async fn get_api_key_from_raw_value(
    pool: &PgPool,
    cache: Arc<Cache>,
    raw_api_key: String,
) -> anyhow::Result<db::api_keys::ProjectApiKey> {
    let api_key_hash = hash_api_key(&raw_api_key);
    let cache_res = cache
        .get::<db::api_keys::ProjectApiKey>(&api_key_hash)
        .await;
    match cache_res {
        Ok(Some(api_key)) => Ok(api_key),
        Ok(None) | Err(_) => {
            let api_key = db::api_keys::get_api_key(pool, &api_key_hash).await?;
            let _ = cache
                .insert::<db::api_keys::ProjectApiKey>(api_key_hash, &api_key)
                .await;

            Ok(api_key)
        }
    }
}
