use anyhow::{Context, Result};
use serde_json::Value;
use sqlx::{prelude::FromRow, PgPool};
use uuid::Uuid;

use crate::datasets::datapoints::Datapoint;

pub async fn insert_datapoints(
    pool: &PgPool,
    dataset_id: &Uuid,
    datapoints: Vec<Datapoint>,
) -> Result<Vec<Datapoint>> {
    let size = datapoints.len();
    let datapoints = sqlx::query_as::<_, Datapoint>(
        "INSERT INTO dataset_datapoints (dataset_id, id, data, target, index_in_batch)
        SELECT $1 as dataset_id, id, data, target, index_in_batch
        FROM UNNEST($2::uuid[], $3::jsonb[], $4::jsonb[], $5::int8[])
        AS tmp_table(id, data, target, index_in_batch)
        RETURNING id, dataset_id, data, target",
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
            .into_iter()
            .map(|dp| dp.target)
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
) -> Result<Vec<Datapoint>> {
    let valid_datapoints = data
        .iter()
        .filter_map(|value| Datapoint::try_from_raw_value(dataset_id.to_owned(), value))
        .collect();

    insert_datapoints(pool, dataset_id, valid_datapoints).await
}

pub async fn get_all_datapoints(pool: &PgPool, dataset_id: Uuid) -> Result<Vec<Datapoint>> {
    let datapoints = sqlx::query_as::<_, Datapoint>(
        "SELECT id, dataset_id, data, target
        FROM dataset_datapoints
        WHERE dataset_id = $1
        ORDER BY
            created_at DESC,
            index_in_batch ASC NULLS FIRST",
    )
    .bind(dataset_id)
    .fetch_all(pool)
    .await?;

    Ok(datapoints)
}

pub async fn get_datapoints_paginated(
    pool: &PgPool,
    dataset_id: Uuid,
    limit: i64,
    offset: i64,
) -> Result<Vec<Datapoint>> {
    let datapoints = sqlx::query_as::<_, Datapoint>(
        "SELECT id, dataset_id, data, target
        FROM dataset_datapoints
        WHERE dataset_id = $1
        ORDER BY
            created_at DESC,
            index_in_batch ASC NULLS FIRST
        LIMIT $2
        OFFSET $3",
    )
    .bind(dataset_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    Ok(datapoints)
}

pub async fn update_datapoint(
    pool: &PgPool,
    datapoint_id: &Uuid,
    data: &Value,
    target: &Value,
) -> Result<Datapoint> {
    let datapoint = sqlx::query_as::<_, Datapoint>(
        "UPDATE dataset_datapoints SET data = $2, target = $3 WHERE id = $1
        RETURNING id, dataset_id, data, target",
    )
    .bind(datapoint_id)
    .bind(data)
    .bind(target)
    .fetch_optional(pool)
    .await?;

    datapoint.context(anyhow::anyhow!("Failed to find datapoint by id"))
}

pub async fn delete_datapoints(pool: &PgPool, datapoint_ids: &Vec<Uuid>) -> Result<()> {
    sqlx::query("DELETE FROM dataset_datapoints WHERE id in (SELECT * FROM UNNEST($1::uuid[]))")
        .bind(datapoint_ids)
        .execute(pool)
        .await?;

    Ok(())
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
