use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, get, post, web};
use chrono::Utc;
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::Cache,
    ch::datapoints::{self as ch_datapoints},
    datasets::datapoints::{CHQueryEngineDatapoint, Datapoint},
    db::{self, DB, project_api_keys::ProjectApiKey},
    query_engine::QueryEngine,
    routes::{PaginatedResponse, types::ResponseResult},
    sql::{self, ClickhouseReadonlyClient},
    storage::StorageService,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetDatasetsRequest {
    #[serde(default)]
    id: Option<Uuid>,
    #[serde(default)]
    name: Option<String>,
}

#[get("/datasets")]
async fn get_datasets(
    db: web::Data<DB>,
    project_api_key: ProjectApiKey,
    req: web::Query<GetDatasetsRequest>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let request = req.into_inner();
    let datasets =
        db::datasets::get_datasets(&db.pool, project_id, request.id, request.name).await?;

    Ok(HttpResponse::Ok().json(datasets))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetDatapointsRequestParams {
    #[serde(flatten)]
    dataset: DatasetIdentifier,
    limit: i64,
    offset: i64,
}

#[get("/datasets/datapoints")]
async fn get_datapoints(
    params: web::Query<GetDatapointsRequestParams>,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    project_api_key: ProjectApiKey,
    http_client: web::Data<Arc<reqwest::Client>>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let clickhouse_ro = if let Some(clickhouse_ro) = clickhouse_ro.as_ref() {
        clickhouse_ro.clone()
    } else {
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "ClickHouse read-only client is not configured"
        })));
    };
    let query_engine = query_engine.into_inner().as_ref().clone();
    let query = params.into_inner();
    let http_client = http_client.into_inner().as_ref().clone();
    let cache = cache.into_inner();

    let dataset_id = match query.dataset {
        DatasetIdentifier::Name(name) => {
            let Some(dataset_id) =
                db::datasets::get_dataset_id_by_name(&db.pool, &name.dataset_name, project_id)
                    .await?
            else {
                return Ok(HttpResponse::NotFound().json(serde_json::json!({
                    "error": "Dataset not found"
                })));
            };
            dataset_id
        }
        DatasetIdentifier::Id(id) => id.dataset_id,
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
        ("limit".to_string(), Value::Number(query.limit.into())),
        ("offset".to_string(), Value::Number(query.offset.into())),
    ]);

    let select_query_result = sql::execute_sql_query(
        select_query.to_string(),
        project_id,
        parameters.clone(),
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
        clickhouse_ro,
        query_engine,
        http_client.clone(),
        db.clone(),
        cache.clone(),
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

    let response = PaginatedResponse {
        total_count,
        items: datapoints,
        any_in_project: total_count > 0,
    };

    Ok(HttpResponse::Ok().json(response))
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
enum DatasetIdentifier {
    Name(DatasetName),
    Id(DatasetId),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateDatapointsRequest {
    #[serde(flatten)]
    dataset: DatasetIdentifier,
    datapoints: Vec<RequestDatapoint>,
    #[serde(default)]
    create_dataset: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequestDatapoint {
    #[serde(default)]
    id: Option<Uuid>,
    data: serde_json::Value,
    target: Option<serde_json::Value>,
    #[serde(default)]
    metadata: std::collections::HashMap<String, serde_json::Value>,
}

/// Create datapoints in a dataset
#[post("/datasets/datapoints")]
async fn create_datapoints(
    req: web::Json<CreateDatapointsRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let db = db.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let request = req.into_inner();
    let mut created = false;

    // Validate that we have datapoints to insert
    if request.datapoints.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "No datapoints provided"
        })));
    }

    let dataset_id = match request.dataset {
        DatasetIdentifier::Name(name) => {
            match db::datasets::get_dataset_id_by_name(&db.pool, &name.dataset_name, project_id)
                .await?
            {
                Some(dataset_id) => {
                    if request.create_dataset {
                        return Ok(HttpResponse::Conflict().json(serde_json::json!({
                            "error": "Dataset with this name already exists"
                        })));
                    }
                    dataset_id
                }
                None => {
                    if request.create_dataset {
                        let dataset =
                            db::datasets::create_dataset(&db.pool, &name.dataset_name, project_id)
                                .await?;
                        created = true;
                        dataset.id
                    } else {
                        return Ok(HttpResponse::NotFound().json(serde_json::json!({
                            "error": "Dataset not found"
                        })));
                    }
                }
            }
        }
        DatasetIdentifier::Id(id) => {
            if request.create_dataset {
                return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "When creating a new dataset, the name must be provided"
                })));
            }
            if !db::datasets::dataset_exists(&db.pool, id.dataset_id, project_id).await? {
                return Ok(HttpResponse::NotFound().json(serde_json::json!({
                    "error": "Dataset not found"
                })));
            }
            id.dataset_id
        }
    };

    // Convert request datapoints to Datapoint structs
    let datapoints: Vec<Datapoint> = request
        .datapoints
        .into_iter()
        .map(|dp_req| Datapoint {
            // `now_v7` is guaranteed to be sorted by creation time
            id: dp_req.id.unwrap_or(Uuid::now_v7()),
            created_at: Utc::now(),
            dataset_id,
            data: dp_req.data,
            target: dp_req.target,
            metadata: dp_req.metadata,
        })
        .collect();

    let ch_datapoints: Vec<ch_datapoints::CHDatapoint> = datapoints
        .iter()
        .map(|dp| ch_datapoints::CHDatapoint::from_datapoint(dp, project_id))
        .collect();

    ch_datapoints::insert_datapoints(clickhouse, ch_datapoints).await?;

    let datapoint_info = datapoints
        .iter()
        .map(|dp| {
            serde_json::json!({
                "id": dp.id,
                "createdAt": dp.created_at,
            })
        })
        .collect::<Vec<_>>();

    let mut response = if created {
        HttpResponse::Created()
    } else {
        HttpResponse::Ok()
    };
    Ok(response.json(serde_json::json!({
        "message": "Datapoints created successfully",
        "datasetId": dataset_id,
        "count": datapoints.len(),
        "datapointInfo": datapoint_info,
    })))
}

#[get("/datasets/{dataset_id}/parquets/{idx}")]
async fn get_parquet(
    path: web::Path<(String, String)>,
    db: web::Data<DB>,
    storage: web::Data<Arc<StorageService>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let (dataset_id_str, name) = path.into_inner();
    let dataset_id =
        Uuid::parse_str(&dataset_id_str).map_err(|_| anyhow::anyhow!("Invalid dataset ID"))?;

    let project_id = project_api_key.project_id;
    let db = db.into_inner();

    let parquet_path =
        db::datasets::get_parquet_path(&db.pool, project_id, dataset_id, &name).await?;

    let Some(parquet_path) = parquet_path else {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Parquet not found"
        })));
    };

    let Ok(bucket) = std::env::var("S3_EXPORTS_BUCKET") else {
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "exports storage is not configured"
        })));
    };
    let content_length = storage.get_size(project_id, &bucket, &parquet_path).await?;

    let get_response = storage
        .get_stream(project_id, &bucket, &parquet_path)
        .await?;

    let filename = parquet_path.split('/').last().unwrap_or(&name);

    let mut response = HttpResponse::Ok();

    response
        .content_type("application/octet-stream")
        .insert_header((
            "Content-Disposition",
            format!("attachment; filename=\"{}\"", filename),
        ))
        .insert_header(("Cache-Control", "no-cache"))
        .no_chunking(content_length);

    Ok(response.streaming(get_response.map(|e| Ok::<_, anyhow::Error>(e))))
}
