use std::collections::HashMap;

use super::DB;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::QueryBuilder;
use uuid::Uuid;

#[derive(sqlx::FromRow, Debug)]
pub struct Evaluator {
    pub id: Uuid,
    #[allow(dead_code)]
    pub project_id: Uuid,
    #[allow(dead_code)]
    pub name: String,
    #[allow(dead_code)]
    pub evaluator_type: String,
    #[sqlx(json)]
    pub definition: HashMap<String, Value>,
    #[allow(dead_code)]
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize, Serialize, PartialEq, Clone, Debug)]
pub enum EvaluatorScoreSource {
    Evaluator,
    SDK,
}

pub async fn insert_evaluator_score(
    db: &DB,
    id: Uuid,
    project_id: Uuid,
    name: &str,
    source: EvaluatorScoreSource,
    span_id: Uuid,
    evaluator_id: Option<Uuid>,
    score: f64,
    metadata: Option<Value>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO evaluator_scores (id, project_id, name, source, span_id, evaluator_id, score, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(id)
    .bind(project_id)
    .bind(name)
    .bind(Into::<i16>::into(source))
    .bind(span_id)
    .bind(evaluator_id)
    .bind(score)
    .bind(metadata)
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

pub async fn get_evaluators_by_path(
    db: &DB,
    project_id: Uuid,
    path: Vec<String>,
) -> Result<Vec<Evaluator>, sqlx::Error> {
    let path_length = path.len() as i32;

    let mut query_builder = QueryBuilder::new(
        r#"
        SELECT e.id, e.project_id, e.name, e.evaluator_type, e.definition, e.created_at
        FROM evaluators e
        JOIN evaluator_span_paths esp ON e.id = esp.evaluator_id
        WHERE e.project_id = 
        "#,
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

impl Into<i16> for EvaluatorScoreSource {
    fn into(self) -> i16 {
        match self {
            EvaluatorScoreSource::Evaluator => 0,
            EvaluatorScoreSource::SDK => 1,
        }
    }
}
