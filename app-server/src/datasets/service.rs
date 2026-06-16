//! Dataset datapoint operations shared by the project-API-key handlers
//! (`api::v1::datasets`) and the CLI user-token handlers (`api::v1::cli::datasets`).
//!
//! Fat-service / thin-handler: these take plain args and return a domain result
//! (`Option` / a typed outcome enum) — the handlers own auth and map the result
//! to HTTP. Business-rule branches are outcome variants; only infra failures use
//! the `anyhow::Result` error channel.

use std::{collections::HashMap, sync::Arc};

use chrono::Utc;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    ch::datapoints::{self as ch_datapoints},
    db::{self, DB},
    query_engine::QueryEngine,
    sql::{self, ClickhouseReadonlyClient, SqlQuerySource},
};

use super::datapoints::{CHQueryEngineDatapoint, Datapoint};

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
            metadata
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
        SqlQuerySource::Frontend,
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
        SqlQuerySource::Frontend,
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

    let datapoints: Vec<Datapoint> = new_datapoints
        .into_iter()
        .map(|dp| Datapoint {
            // `now_v7` is guaranteed to be sorted by creation time
            id: dp.id.unwrap_or(Uuid::now_v7()),
            created_at: Utc::now(),
            dataset_id,
            data: dp.data,
            target: dp.target,
            metadata: dp.metadata,
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
