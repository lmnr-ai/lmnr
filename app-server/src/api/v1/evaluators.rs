use actix_web::{
    HttpResponse, post,
    web::{Data, Json},
};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    ch::evaluator_scores::insert_evaluator_score_ch,
    db::{
        DB,
        evaluators::{EvaluatorScoreSource, insert_evaluator_score},
        project_api_keys::ProjectApiKey,
        spans::{get_root_span_id, is_span_in_project},
    },
    routes::types::ResponseResult,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEvaluatorScoreBase {
    pub name: String,
    pub metadata: Option<Value>,
    pub score: f64,
    pub source: EvaluatorScoreSource,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEvaluatorScoreRequestWithTraceId {
    #[serde(flatten)]
    pub base: CreateEvaluatorScoreBase,
    pub trace_id: Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEvaluatorScoreRequestWithSpanId {
    #[serde(flatten)]
    pub base: CreateEvaluatorScoreBase,
    pub span_id: Uuid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum CreateEvaluatorScoreRequest {
    WithTraceId(CreateEvaluatorScoreRequestWithTraceId),
    WithSpanId(CreateEvaluatorScoreRequestWithSpanId),
}

#[post("/evaluators/score")]
pub async fn create_evaluator_score(
    req: Json<CreateEvaluatorScoreRequest>,
    db: Data<DB>,
    clickhouse: Data<clickhouse::Client>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let req = req.into_inner();

    // Extract common fields from both variants
    let (name, metadata, score, source) = match &req {
        CreateEvaluatorScoreRequest::WithTraceId(CreateEvaluatorScoreRequestWithTraceId {
            base:
                CreateEvaluatorScoreBase {
                    name,
                    metadata,
                    score,
                    source,
                },
            ..
        }) => (name, metadata, score, source),
        CreateEvaluatorScoreRequest::WithSpanId(CreateEvaluatorScoreRequestWithSpanId {
            base:
                CreateEvaluatorScoreBase {
                    name,
                    metadata,
                    score,
                    source,
                },
            ..
        }) => (name, metadata, score, source),
    };

    let span_id = match &req {
        CreateEvaluatorScoreRequest::WithTraceId(req) => {
            get_root_span_id(&db.pool, &req.trace_id, &project_api_key.project_id).await?
        }
        CreateEvaluatorScoreRequest::WithSpanId(req) => {
            let exists =
                is_span_in_project(&db.pool, &req.span_id, &project_api_key.project_id).await?;
            if !exists {
                return Ok(HttpResponse::NotFound().body("No matching spans found"));
            }
            Some(req.span_id)
        }
    };

    let Some(span_id) = span_id else {
        return Ok(HttpResponse::NotFound().body("No matching spans found"));
    };

    let project_id = project_api_key.project_id;
    let score_id = Uuid::new_v4();

    let _ = insert_evaluator_score(
        &db.pool,
        score_id,
        project_id,
        name,
        source.clone(),
        span_id,
        None,
        *score,
        metadata.clone(),
    )
    .await?;

    let _ = insert_evaluator_score_ch(
        clickhouse.into_inner().as_ref().clone(),
        score_id,
        project_id,
        name,
        source.clone(),
        span_id,
        None,
        *score,
    )
    .await?;

    Ok(HttpResponse::Ok().finish())
}
