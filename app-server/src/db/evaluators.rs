use std::collections::HashMap;

use serde_json::Value;
use uuid::Uuid;
use sqlx::QueryBuilder;
use super::DB;

#[derive(sqlx::FromRow, Debug)]
pub struct Evaluator {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub evaluator_type: String,
    #[sqlx(json)]
    pub definition: HashMap<String, Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn insert_evaluator_score(
    db: &DB,
    id: Uuid,
    project_id: Uuid,
    span_id: Uuid,
    evaluator_id: Uuid,
    score: f64,
) -> Result<(), sqlx::Error> {
 sqlx::query(
        r#"
        INSERT INTO evaluator_scores (id, project_id, span_id, evaluator_id, score)
        VALUES ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(id)
    .bind(project_id)
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
        SELECT id, project_id, name, evaluator_type, definition, created_at
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
        SELECT e.id, e.project_id, e.name, e.evaluator_type, e.definition, e.created_at
        FROM evaluators e
        JOIN evaluator_span_paths esp ON e.id = esp.evaluator_id
        WHERE e.project_id = 
        "#
    );
    
    query_builder.push_bind(project_id);
    query_builder.push(" AND jsonb_array_length(esp.span_path) = ");
    query_builder.push_bind(path_length);
    
    for (i, element) in path.iter().enumerate() {
        // Use ->> operator to extract as text, avoiding JSON casting issues
        query_builder.push(&format!(" AND esp.span_path->>{} = ", i));
        query_builder.push_bind(element);
    }
    
    query_builder
        .build_query_as::<Evaluator>()
        .fetch_all(&db.pool)
        .await
}