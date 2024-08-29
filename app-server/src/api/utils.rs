use std::sync::Arc;

use uuid::Uuid;

use crate::db::limits::RunCountLimitExceeded;
use crate::db::pipelines::PipelineVersion;
use crate::pipeline::utils::get_pipeline_version_cache_key;
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
) -> Result<PipelineVersion, error::Error> {
    let cache_key = get_pipeline_version_cache_key(&project_id.to_string(), &pipeline_name);
    let cache_res = cache.get::<PipelineVersion>(&cache_key).await;
    match cache_res {
        Ok(Some(pipeline_version)) => Ok(pipeline_version),
        Ok(None) | Err(_) => {
            let pipeline_version =
                db::pipelines::pipeline_version::get_target_pipeline_version_by_pipeline_name(
                    &db.pool,
                    project_id,
                    &pipeline_name,
                )
                .await?;
            let _ = cache
                .insert::<PipelineVersion>(cache_key, &pipeline_version)
                .await;
            Ok(pipeline_version)
        }
    }
}

pub async fn query_project_run_count_exceeded(
    db: Arc<DB>,
    cache: Arc<Cache>,
    project_id: &Uuid,
) -> anyhow::Result<RunCountLimitExceeded> {
    let cache_res = cache
        .get::<RunCountLimitExceeded>(&project_id.to_string())
        .await;
    match cache_res {
        Ok(Some(run_count)) => Ok(run_count),
        Ok(None) | Err(_) => {
            let current_runs = db::limits::get_run_count_by_project_id(&db.pool, &project_id)
                .await?
                .count_since_reset;
            let limits = db::limits::get_limits_by_project_id(&db.pool, &project_id).await?;
            let max_runs = limits.pipeline_runs_per_month;

            let exceeded = max_runs > 0 && current_runs >= max_runs;
            let res = RunCountLimitExceeded { exceeded };

            let _ = cache
                .insert::<RunCountLimitExceeded>(project_id.to_string(), &res)
                .await;

            Ok(res)
        }
    }
}

pub async fn update_project_run_count_exceeded(
    db: Arc<DB>,
    cache: Arc<Cache>,
    pipeline_version_id: &Uuid,
) -> anyhow::Result<()> {
    let project_id = db::pipelines::get_pipeline_by_version_id(&db.pool, pipeline_version_id)
        .await?
        .project_id;
    let current_runs = db::limits::get_run_count_by_project_id(&db.pool, &project_id)
        .await?
        .count_since_reset;
    let limits = db::limits::get_limits_by_project_id(&db.pool, &project_id).await?;
    let max_runs = limits.pipeline_runs_per_month;

    let exceeded = max_runs > 0 && current_runs >= max_runs;
    let res = RunCountLimitExceeded { exceeded };

    let _ = cache
        .insert::<RunCountLimitExceeded>(project_id.to_string(), &res)
        .await?;

    Ok(())
}
