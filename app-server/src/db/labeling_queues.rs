use anyhow::Result;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(sqlx::FromRow)]
pub struct LabelingQueue {
    pub id: Uuid,
    pub name: String,
    pub project_id: Uuid,
}

pub async fn get_labeling_queue_by_name(
    pool: &PgPool,
    name: &str,
    project_id: &Uuid,
) -> Result<LabelingQueue> {
    let queue = sqlx::query_as::<_, LabelingQueue>(
        "SELECT id, name, project_id FROM labeling_queues WHERE name = $1 AND project_id = $2",
    )
    .bind(name)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(queue)
}

pub async fn push_to_labeling_queue(
    pool: &PgPool,
    queue_id: &Uuid,
    data_vec: &Vec<Value>,
    action_vec: &Vec<Value>,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO labeling_queue_data (
            queue_id,
            data,
            action,
            index_in_batch
        ) SELECT
            $1 as queue_id,
            data,
            action,
            index_in_batch
        FROM
            UNNEST ($2::jsonb[], $3::jsonb[], $4::int8[])
            AS tmp_table(data, action, index_in_batch)
         ",
    )
    .bind(queue_id)
    .bind(data_vec)
    .bind(action_vec)
    .bind(Vec::from_iter(0..data_vec.len() as i64))
    .execute(pool)
    .await?;
    Ok(())
}
