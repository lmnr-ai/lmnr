//! Dataset CRUD and datapoint operations shared by the project-API-key handlers
//! (`api::v1::datasets`) and the CLI user-token handlers (`api::v1::cli::datasets`).
//!
//! Fat-service / thin-handler: these take plain args and return a domain result
//! (`Option` / a typed outcome enum) — the handlers own auth and map the result
//! to HTTP. Business-rule branches are outcome variants; only infra failures use
//! the `anyhow::Result` error channel.

use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    access_policy::AccessPolicy,
    cache::Cache,
    ch::datapoints::{self as ch_datapoints},
    db::{self, DB},
    query_engine::QueryEngine,
    sql::{self, ClickhouseReadonlyClient, SqlQuerySource},
};

use super::datapoints::{CHQueryEngineDatapoint, Datapoint};

#[derive(Debug, thiserror::Error)]
pub enum DatasetError {
    #[error("Dataset name is required")]
    InvalidName,
    #[error("Dataset not found")]
    DatasetNotFound,
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

pub fn error_response(error: DatasetError) -> actix_web::HttpResponse {
    use actix_web::HttpResponse;

    match error {
        DatasetError::InvalidName => HttpResponse::BadRequest().json(json!({
            "error": error.to_string()
        })),
        DatasetError::DatasetNotFound => HttpResponse::NotFound().json(json!({
            "error": error.to_string()
        })),
        DatasetError::Internal(error) => {
            log::error!("dataset CRUD error: {error:?}");
            HttpResponse::InternalServerError().json(json!({
                "error": "Internal server error"
            }))
        }
    }
}

pub async fn create_dataset(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    name: String,
) -> Result<db::datasets::Dataset, DatasetError> {
    if name.is_empty() {
        return Err(DatasetError::InvalidName);
    }
    db::datasets::create_dataset(pool, &name, project_id)
        .await
        .map_err(DatasetError::Internal)
}

pub async fn get_dataset(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    dataset_id: Uuid,
) -> Result<db::datasets::Dataset, DatasetError> {
    db::datasets::get_dataset(pool, dataset_id, project_id)
        .await
        .map_err(DatasetError::Internal)?
        .ok_or(DatasetError::DatasetNotFound)
}

pub async fn update_dataset(
    pool: &sqlx::PgPool,
    project_id: Uuid,
    dataset_id: Uuid,
    name: String,
) -> Result<db::datasets::Dataset, DatasetError> {
    if name.is_empty() {
        return Err(DatasetError::InvalidName);
    }
    db::datasets::update_dataset(pool, dataset_id, project_id, &name)
        .await
        .map_err(DatasetError::Internal)?
        .ok_or(DatasetError::DatasetNotFound)
}

pub async fn delete_dataset(
    pool: &sqlx::PgPool,
    clickhouse: &clickhouse::Client,
    project_id: Uuid,
    dataset_id: Uuid,
) -> Result<db::datasets::Dataset, DatasetError> {
    // Match the frontend deletion order: remove Postgres metadata first, then
    // issue the ClickHouse datapoint mutation. These stores cannot share a transaction.
    let dataset = db::datasets::delete_dataset(pool, dataset_id, project_id)
        .await
        .map_err(DatasetError::Internal)?
        .ok_or(DatasetError::DatasetNotFound)?;

    clickhouse
        .query(
            "DELETE FROM dataset_datapoints
             WHERE project_id = ? AND dataset_id = ?",
        )
        .bind(project_id)
        .bind(dataset_id)
        .execute()
        .await
        .map_err(anyhow::Error::from)?;

    Ok(dataset)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetName {
    #[serde(alias = "dataset_name", alias = "name")]
    pub dataset_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetId {
    #[serde(alias = "dataset_id")]
    pub dataset_id: Uuid,
}

/// How a request identifies a dataset — by name or by id. Deserialized
/// (untagged) from the flattened request body on both auth surfaces.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum DatasetIdentifier {
    Name(DatasetName),
    Id(DatasetId),
}

/// A datapoint as supplied by a create request (id optional — minted if absent).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewDatapoint {
    #[serde(default)]
    pub id: Option<Uuid>,
    pub data: Value,
    pub target: Option<Value>,
    #[serde(default)]
    pub metadata: HashMap<String, Value>,
    /// Groups this datapoint's evaluation trials. Defaults to the datapoint id.
    #[serde(default)]
    pub task_id: Option<String>,
}

/// Outcome of [`create_datapoints`]. Each non-`Created` variant is a business
/// rule the handler maps to a specific HTTP status.
pub enum CreateDatapointsOutcome {
    Created {
        dataset_id: Uuid,
        datapoints: Vec<Datapoint>,
        dataset_was_created: bool,
    },
    /// Empty `datapoints` array → 400.
    NoDatapoints,
    /// `createDataset` + a name that already exists → 409.
    DatasetNameConflict,
    /// `createDataset` with an id identifier (no name to create) → 400.
    NameRequiredForCreate,
    /// Dataset referenced by name/id doesn't exist (and not creating) → 404.
    DatasetNotFound,
}

/// Fetch one page of a dataset's datapoints (ordered by id, paginated). Returns
/// `Ok(None)` when a dataset referenced by name doesn't exist (→ 404 at the
/// handler); `Ok(Some((items, total_count)))` otherwise.
#[allow(clippy::too_many_arguments)]
pub async fn fetch_datapoints_page(
    project_id: Uuid,
    dataset: DatasetIdentifier,
    limit: i64,
    offset: i64,
    clickhouse_ro: Arc<ClickhouseReadonlyClient>,
    query_engine: Arc<QueryEngine>,
    http_client: Arc<reqwest::Client>,
    db: Arc<DB>,
    cache: Arc<Cache>,
) -> anyhow::Result<Option<(Vec<Datapoint>, u64)>> {
    let dataset_id = match dataset {
        DatasetIdentifier::Name(name) => {
            match db::datasets::get_dataset_id_by_name(&db.pool, &name.dataset_name, project_id)
                .await?
            {
                Some(id) => id,
                None => return Ok(None),
            }
        }
        DatasetIdentifier::Id(id) => {
            // Object-level authZ: a body-supplied dataset id must belong to the
            // authorized project, else a project-A member could read project-B
            // data. Mirror the write path; `None` → 404 (don't leak existence).
            if !db::datasets::dataset_exists(&db.pool, id.dataset_id, project_id).await? {
                return Ok(None);
            }
            id.dataset_id
        }
    };

    let select_query = "
        SELECT
            id,
            dataset_id,
            created_at,
            data,
            target,
            metadata,
            task_id
        FROM dataset_datapoints
        WHERE dataset_id = {dataset_id:UUID}
        ORDER BY toUInt128(id) ASC
        LIMIT {limit:Int64}
        OFFSET {offset:Int64}
    ";
    let parameters = HashMap::from([
        (
            "dataset_id".to_string(),
            Value::String(dataset_id.to_string()),
        ),
        ("limit".to_string(), Value::Number(limit.into())),
        ("offset".to_string(), Value::Number(offset.into())),
    ]);

    let select_query_result = sql::execute_sql_query(
        select_query.to_string(),
        project_id,
        parameters,
        SqlQuerySource::Internal,
        AccessPolicy::UNRESTRICTED,
        clickhouse_ro.clone(),
        query_engine.clone(),
        http_client.clone(),
        db.clone(),
        cache.clone(),
    )
    .await?;

    let total_count_query = "
        SELECT COUNT(*) as count FROM dataset_datapoints
        WHERE dataset_id = {dataset_id:UUID}
    ";

    let total_count_result = sql::execute_sql_query(
        total_count_query.to_string(),
        project_id,
        HashMap::from([(
            "dataset_id".to_string(),
            Value::String(dataset_id.to_string()),
        )]),
        SqlQuerySource::Internal,
        AccessPolicy::UNRESTRICTED,
        clickhouse_ro,
        query_engine,
        http_client,
        db,
        cache,
    )
    .await?;

    let total_count = total_count_result
        .first()
        .and_then(|v| v.get("count").and_then(|v| v.as_i64()).map(|v| v as u64))
        .unwrap_or_default();

    let datapoints: Vec<Datapoint> = select_query_result
        .into_iter()
        .map(|ch_dp| {
            serde_json::from_value::<CHQueryEngineDatapoint>(ch_dp)
                .map_err(anyhow::Error::from)
                .and_then(|ch_dp| ch_dp.try_into())
        })
        .collect::<Result<Vec<Datapoint>, anyhow::Error>>()?;

    Ok(Some((datapoints, total_count)))
}

/// Resolve-or-create the target dataset and insert the datapoints. Returns a
/// [`CreateDatapointsOutcome`] — the handler maps each variant to an HTTP status.
pub async fn create_datapoints(
    project_id: Uuid,
    dataset: DatasetIdentifier,
    new_datapoints: Vec<NewDatapoint>,
    create_dataset: bool,
    db: Arc<DB>,
    clickhouse: clickhouse::Client,
) -> anyhow::Result<CreateDatapointsOutcome> {
    if new_datapoints.is_empty() {
        return Ok(CreateDatapointsOutcome::NoDatapoints);
    }

    let mut dataset_was_created = false;
    let dataset_id = match dataset {
        DatasetIdentifier::Name(name) => {
            match db::datasets::get_dataset_id_by_name(&db.pool, &name.dataset_name, project_id)
                .await?
            {
                Some(id) => {
                    if create_dataset {
                        return Ok(CreateDatapointsOutcome::DatasetNameConflict);
                    }
                    id
                }
                None => {
                    if create_dataset {
                        let dataset =
                            db::datasets::create_dataset(&db.pool, &name.dataset_name, project_id)
                                .await?;
                        dataset_was_created = true;
                        dataset.id
                    } else {
                        return Ok(CreateDatapointsOutcome::DatasetNotFound);
                    }
                }
            }
        }
        DatasetIdentifier::Id(id) => {
            if create_dataset {
                return Ok(CreateDatapointsOutcome::NameRequiredForCreate);
            }
            if !db::datasets::dataset_exists(&db.pool, id.dataset_id, project_id).await? {
                return Ok(CreateDatapointsOutcome::DatasetNotFound);
            }
            id.dataset_id
        }
    };

    let new_datapoints: Vec<(Uuid, NewDatapoint)> = new_datapoints
        .into_iter()
        // `now_v7` is guaranteed to be sorted by creation time
        .map(|dp| (dp.id.unwrap_or(Uuid::now_v7()), dp))
        .collect();
    let ids: Vec<Uuid> = new_datapoints.iter().map(|(id, _)| *id).collect();
    let requested: Vec<(Uuid, Option<String>)> = new_datapoints
        .iter()
        .map(|(id, dp)| (*id, requested_task_id(dp)))
        .collect();
    let candidate_task_ids: Vec<String> = requested
        .iter()
        .map(|(id, task_id)| task_id.clone().unwrap_or_else(|| id.to_string()))
        .collect();
    let existing_task_ids = ch_datapoints::get_datapoint_task_ids(
        &clickhouse,
        project_id,
        dataset_id,
        &ids,
        &candidate_task_ids,
    )
    .await?;
    let task_ids = assign_task_ids(&requested, &existing_task_ids);

    let datapoints: Vec<Datapoint> = new_datapoints
        .into_iter()
        .zip(task_ids)
        .map(|((id, dp), task_id)| Datapoint {
            id,
            created_at: Utc::now(),
            dataset_id,
            data: dp.data,
            target: dp.target,
            metadata: dp.metadata,
            task_id,
        })
        .collect();

    let ch_datapoints: Vec<ch_datapoints::CHDatapoint> = datapoints
        .iter()
        .map(|dp| ch_datapoints::CHDatapoint::from_datapoint(dp, project_id))
        .collect();

    ch_datapoints::insert_datapoints(clickhouse, ch_datapoints).await?;

    Ok(CreateDatapointsOutcome::Created {
        dataset_id,
        datapoints,
        dataset_was_created,
    })
}

/// The caller's task id; null, missing and "" all mean "use the default".
fn requested_task_id(dp: &NewDatapoint) -> Option<String> {
    dp.task_id.clone().filter(|task_id| !task_id.is_empty())
}

/// Resolve each incoming datapoint's task id, in order. A datapoint without a
/// requested task id keeps its stored one (re-push of an existing id), else gets
/// its id. Task ids are unique within a dataset: a duplicate — within the batch
/// or against another stored datapoint — is renamed `<task_id>#2`, `#3`, ...
fn assign_task_ids(
    requested: &[(Uuid, Option<String>)],
    existing: &HashMap<Uuid, String>,
) -> Vec<String> {
    let incoming_ids: HashSet<&Uuid> = requested.iter().map(|(id, _)| id).collect();
    let mut taken: HashSet<String> = existing
        .iter()
        .filter(|(id, _)| !incoming_ids.contains(id))
        .map(|(_, task_id)| task_id.clone())
        .collect();

    requested
        .iter()
        .map(|(id, task_id)| {
            let base = task_id
                .clone()
                .or_else(|| existing.get(id).cloned())
                .unwrap_or_else(|| id.to_string());
            let task_id = if taken.contains(&base) {
                (2..)
                    .map(|n| format!("{base}#{n}"))
                    .find(|candidate| !taken.contains(candidate))
                    .expect("unbounded suffix range")
            } else {
                base
            };
            taken.insert(task_id.clone());
            task_id
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_datapoint_task_id_null_missing_or_empty_is_unset() {
        for body in [
            serde_json::json!({"data": {}, "target": null, "taskId": null}),
            serde_json::json!({"data": {}, "target": null}),
            serde_json::json!({"data": {}, "target": null, "taskId": ""}),
        ] {
            let dp: NewDatapoint = serde_json::from_value(body).unwrap();
            assert_eq!(requested_task_id(&dp), None);
        }
    }

    #[test]
    fn assign_task_ids_defaults_to_datapoint_id() {
        let id = Uuid::new_v4();
        assert_eq!(
            assign_task_ids(&[(id, None)], &HashMap::new()),
            vec![id.to_string()]
        );
    }

    #[test]
    fn assign_task_ids_renames_duplicates_within_batch() {
        let requested = [
            (Uuid::new_v4(), Some("a".to_string())),
            (Uuid::new_v4(), Some("a".to_string())),
            (Uuid::new_v4(), Some("a".to_string())),
        ];
        assert_eq!(
            assign_task_ids(&requested, &HashMap::new()),
            vec!["a", "a#2", "a#3"]
        );
    }

    #[test]
    fn assign_task_ids_renames_against_other_stored_datapoints() {
        let existing = HashMap::from([
            (Uuid::new_v4(), "a".to_string()),
            (Uuid::new_v4(), "a#2".to_string()),
        ]);
        let requested = [(Uuid::new_v4(), Some("a".to_string()))];
        assert_eq!(assign_task_ids(&requested, &existing), vec!["a#3"]);
    }

    #[test]
    fn assign_task_ids_repush_keeps_own_task_id() {
        let id = Uuid::new_v4();
        let existing = HashMap::from([(id, "a".to_string())]);
        assert_eq!(assign_task_ids(&[(id, None)], &existing), vec!["a"]);
        assert_eq!(
            assign_task_ids(&[(id, Some("a".to_string()))], &existing),
            vec!["a"]
        );
    }
}
