use std::collections::HashMap;

use serde_json::Value;
use uuid::Uuid;
use sqlx::QueryBuilder;
use super::DB;

#[derive(sqlx::FromRow)]
pub struct Evaluator {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub evaluator_type: String,
    #[sqlx(json)]
    pub data: HashMap<String, Value>,
    pub target: Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn save_evaluator_score(
    db: &DB,
    span_id: Uuid,
    evaluator_id: Uuid,
    score: i32,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO evaluator_scores (span_id, evaluator_id, score)
        VALUES ($1, $2, $3)
        ON CONFLICT (span_id, evaluator_id) 
        DO UPDATE SET 
            score = EXCLUDED.score,
        "#,
    )
    .bind(span_id)
    .bind(evaluator_id)
    .bind(score)
    .execute(&db.pool)
    .await?;

    Ok(())
}

pub async fn get_evaluator(db: &DB, id: Uuid, project_id: Uuid) -> Result<Evaluator, sqlx::Error> {
    sqlx::query_as::<_, Evaluator>(
        r#"
        SELECT id, project_id, name, evaluator_type, data, target, created_at
        FROM evaluators 
        WHERE id = $1 AND project_id = $2
        "#,
    )
    .bind(id)
    .bind(project_id)
    .fetch_one(&db.pool)
    .await
}

pub async fn get_evaluators_by_path(db: &DB, project_id: Uuid, path: Vec<String>) -> Result<Vec<Evaluator>, sqlx::Error> {
    let path_length = path.len() as i32;
    
    let mut query_builder = QueryBuilder::new(
        r#"
        SELECT id, project_id, evaluator_type, data, target
        FROM evaluators 
        WHERE project_id = 
        "#
    );
    
    query_builder.push_bind(project_id);
    query_builder.push(" AND jsonb_array_length(target) = ");
    query_builder.push_bind(path_length);
    
    for (i, element) in path.iter().enumerate() {
        query_builder.push(&format!(" AND target->{} = ", i));
        query_builder.push_bind(element);
        query_builder.push("::jsonb");
    }
    
    query_builder
        .build_query_as::<Evaluator>()
        .fetch_all(&db.pool)
        .await
}