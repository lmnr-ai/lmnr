use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{prelude::FromRow, PgPool, QueryBuilder};
use uuid::Uuid;

use crate::datasets::datapoints::Datapoint;

#[derive(FromRow, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DBDatapoint {
    pub id: Uuid,
    pub created_at: DateTime<Utc>,
    pub dataset_id: Uuid,
    pub data: Value,
    pub target: Option<Value>,
    pub metadata: Value,
}

pub async fn insert_datapoints(
    pool: &PgPool,
    dataset_id: &Uuid,
    datapoints: Vec<Datapoint>,
) -> Result<Vec<DBDatapoint>> {
    let size = datapoints.len();
    let datapoints = sqlx::query_as::<_, DBDatapoint>(
        "INSERT INTO dataset_datapoints 
            (dataset_id, id, data, target, metadata, index_in_batch)
        SELECT $1 as dataset_id, id, data, target, metadata, index_in_batch
        FROM UNNEST($2::uuid[], $3::jsonb[], $4::jsonb[], $5::jsonb[], $6::int8[])
        AS tmp_table(id, data, target, metadata, index_in_batch)
        RETURNING id, created_at, dataset_id, data, target, metadata",
    )
    .bind(dataset_id)
    .bind(&datapoints.iter().map(|dp| dp.id).collect::<Vec<_>>())
    .bind(
        &datapoints
            .iter()
            .map(|dp| dp.data.clone())
            .collect::<Vec<_>>(),
    )
    .bind(
        &datapoints
            .iter()
            .map(|dp| dp.target.clone())
            .collect::<Vec<_>>(),
    )
    .bind(
        &datapoints
            .into_iter()
            .map(|dp| serde_json::to_value(&dp.metadata).unwrap())
            .collect::<Vec<_>>(),
    )
    .bind(&Vec::from_iter(0..size as i64))
    .fetch_all(pool)
    .await?;

    Ok(datapoints)
}

pub async fn insert_raw_data(
    pool: &PgPool,
    dataset_id: &Uuid,
    data: &Vec<Value>,
) -> Result<Vec<DBDatapoint>> {
    let valid_datapoints = data
        .iter()
        .filter_map(|value| Datapoint::try_from_raw_value(dataset_id.to_owned(), value))
        .collect();

    insert_datapoints(pool, dataset_id, valid_datapoints).await
}

pub async fn get_full_datapoints(
    pool: &PgPool,
    dataset_id: Uuid,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<DBDatapoint>> {
    let mut query = QueryBuilder::new(
        "SELECT
            id,
            dataset_id,
            data,
            target,
            metadata,
            created_at
        FROM dataset_datapoints
        WHERE dataset_id = ",
    );
    query.push_bind(dataset_id);
    if let Some(limit) = limit {
        query.push_bind(limit);
    }
    if let Some(offset) = offset {
        query.push_bind(offset);
    }

    let datapoints = query.build_query_as().fetch_all(pool).await?;

    Ok(datapoints)
}

pub async fn get_full_datapoints_by_ids(
    pool: &PgPool,
    dataset_ids: Vec<Uuid>,
    ids: Vec<Uuid>,
) -> Result<Vec<DBDatapoint>> {
    let datapoints = sqlx::query_as::<_, DBDatapoint>(
        "SELECT
            id,
            dataset_id,
            data,
            target,
            metadata,
            created_at
        FROM dataset_datapoints
        WHERE dataset_id = ANY($1) AND id = ANY($2)",
    )
    .bind(&dataset_ids)
    .bind(&ids)
    .fetch_all(pool)
    .await?;

    Ok(datapoints)
}

#[derive(FromRow)]
struct DeletedDatapointId {
    id: Uuid,
}

pub async fn delete_all_datapoints(pool: &PgPool, dataset_id: &Uuid) -> Result<Vec<Uuid>> {
    let datapoint_ids = sqlx::query_as::<_, DeletedDatapointId>(
        "DELETE FROM dataset_datapoints WHERE dataset_id = $1 RETURNING id",
    )
    .bind(dataset_id)
    .fetch_all(pool)
    .await?
    .iter()
    .map(|row| row.id)
    .collect();

    Ok(datapoint_ids)
}

#[derive(FromRow)]
struct Count {
    count: i64,
}

pub async fn count_datapoints(pool: &PgPool, dataset_id: Uuid) -> Result<u64> {
    let count = sqlx::query_as::<_, Count>(
        "SELECT COUNT(*) as count
        FROM dataset_datapoints
        WHERE dataset_id = $1",
    )
    .bind(dataset_id)
    .fetch_one(pool)
    .await?;

    Ok(count.count as u64)
}
