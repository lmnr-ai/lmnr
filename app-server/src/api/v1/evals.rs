use std::{collections::HashMap, sync::Arc};

use crate::{
    ch::evaluation_datapoints::CHEvaluationDatapoint,
    db::{self, DB, project_api_keys::ProjectApiKey},
    evaluations::{
        EvaluationDatapointResult, UpdatedDatapointStrings, insert_evaluation_datapoints,
        update_evaluation_datapoint,
    },
    names::NameGenerator,
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
    routes::types::ResponseResult,
};
use actix_web::{
    HttpResponse, post,
    web::{self, Json},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InitEvalRequest {
    pub name: Option<String>,
    pub group_name: Option<String>,
    #[serde(default)]
    pub metadata: Option<Value>,
}

#[post("/evals")]
pub async fn init_eval(
    req: Json<InitEvalRequest>,
    db: web::Data<DB>,
    name_generator: web::Data<Arc<NameGenerator>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let req = req.into_inner();
    let group_name = req.group_name.unwrap_or("default".to_string());
    let project_id = project_api_key.project_id;
    let metadata = req.metadata;
    let name = if let Some(name) = req.name {
        name
    } else {
        name_generator.next().await
    };

    let evaluation =
        db::evaluations::create_evaluation(&db.pool, &name, project_id, &group_name, &metadata)
            .await?;

    Ok(HttpResponse::Ok().json(evaluation))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveEvalDatapointsRequest {
    pub group_name: Option<String>,
    pub points: Vec<EvaluationDatapointResult>,
}

#[post("/evals/{eval_id}/datapoints")]
pub async fn save_eval_datapoints(
    eval_id: web::Path<Uuid>,
    req: Json<SaveEvalDatapointsRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    pubsub: web::Data<Arc<PubSub>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let eval_id = eval_id.into_inner();
    let req = req.into_inner();
    let project_id = project_api_key.project_id;
    let points = req.points;
    let group_name = req.group_name.unwrap_or("default".to_string());
    let clickhouse = clickhouse.into_inner().as_ref().clone();

    let ch_rows = insert_evaluation_datapoints(
        &db.pool,
        clickhouse,
        points,
        eval_id,
        project_id,
        &group_name,
    )
    .await?;

    if !ch_rows.is_empty() {
        let realtime_points: Vec<RealtimeDatapoint> = ch_rows
            .iter()
            .map(RealtimeDatapoint::from_ch_insert)
            .collect();
        publish_datapoint_upsert(
            pubsub.get_ref().as_ref(),
            &project_id,
            &eval_id,
            &realtime_points,
        )
        .await;
    }

    Ok(HttpResponse::Ok().json(eval_id))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEvalDatapointRequest {
    pub executor_output: Option<Value>,
    pub scores: HashMap<String, Option<f64>>,
    #[serde(default)]
    pub trace_id: Option<Uuid>,
}

#[post("/evals/{eval_id}/datapoints/{datapoint_id}")]
pub async fn update_eval_datapoint(
    path: web::Path<(Uuid, Uuid)>,
    req: Json<UpdateEvalDatapointRequest>,
    db: web::Data<DB>,
    clickhouse: web::Data<clickhouse::Client>,
    pubsub: web::Data<Arc<PubSub>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let (eval_id, datapoint_id) = path.into_inner();
    let req = req.into_inner();
    let clickhouse = clickhouse.into_inner().as_ref().clone();
    let project_id = project_api_key.project_id;

    let group_id = db::evaluations::get_evaluation_group_id(&db.pool, eval_id, project_id).await?;

    let UpdatedDatapointStrings {
        executor_output: ch_executor_output,
        scores: ch_scores,
    } = update_evaluation_datapoint(
        &db.pool,
        clickhouse,
        eval_id,
        project_id,
        datapoint_id,
        &group_id,
        req.executor_output,
        req.scores,
        req.trace_id,
    )
    .await?;

    let realtime_point = RealtimeDatapoint::from_update_strings(
        datapoint_id,
        req.trace_id,
        &ch_executor_output,
        &ch_scores,
    );
    publish_datapoint_upsert(
        pubsub.get_ref().as_ref(),
        &project_id,
        &eval_id,
        std::slice::from_ref(&realtime_point),
    )
    .await;

    Ok(HttpResponse::Ok().json(datapoint_id))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RealtimeDatapoint<'a> {
    id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    index: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    trace_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    scores: Option<&'a str>,
}

impl<'a> RealtimeDatapoint<'a> {
    fn from_ch_insert(row: &'a CHEvaluationDatapoint) -> Self {
        let trace_id = (!row.trace_id.is_nil()).then_some(row.trace_id);
        Self {
            id: row.id,
            index: Some(row.index),
            trace_id,
            data: non_empty(&row.data).map(|s| clip_str(s, TRUNCATE_CHARS)),
            target: non_empty(&row.target).map(|s| clip_str(s, TRUNCATE_CHARS)),
            metadata: non_empty(&row.metadata),
            output: non_empty(&row.executor_output).map(|s| clip_str(s, TRUNCATE_CHARS)),
            scores: non_empty(&row.scores),
        }
    }

    fn from_update_strings(
        datapoint_id: Uuid,
        trace_id: Option<Uuid>,
        executor_output: &'a str,
        scores: &'a str,
    ) -> Self {
        let trace_id = trace_id.filter(|t| !t.is_nil());
        Self {
            id: datapoint_id,
            index: None,
            trace_id,
            data: None,
            target: None,
            metadata: None,
            output: non_empty(executor_output).map(|s| clip_str(s, TRUNCATE_CHARS)),
            scores: non_empty(scores),
        }
    }
}

const TRUNCATE_CHARS: usize = 200;

fn clip_str(s: &str, max_chars: usize) -> &str {
    match s.char_indices().nth(max_chars) {
        Some((byte_idx, _)) => &s[..byte_idx],
        None => s,
    }
}

fn non_empty(s: &str) -> Option<&str> {
    match s.trim() {
        "" | "{}" | "[]" | "null" => None,
        _ => Some(s),
    }
}

async fn publish_datapoint_upsert(
    pubsub: &PubSub,
    project_id: &Uuid,
    evaluation_id: &Uuid,
    datapoints: &[RealtimeDatapoint<'_>],
) {
    if datapoints.is_empty() {
        return;
    }
    let message = SseMessage {
        event_type: "datapoint_upsert".to_string(),
        data: serde_json::json!({ "datapoints": datapoints }),
    };
    let key = format!("evaluation_{}", evaluation_id);
    send_to_key(pubsub, project_id, &key, message).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn clip_str_short_unchanged() {
        assert_eq!(clip_str("hello", TRUNCATE_CHARS), "hello");
    }

    #[test]
    fn clip_str_long_clips_to_max() {
        let s: String = "a".repeat(500);
        assert_eq!(clip_str(&s, TRUNCATE_CHARS).chars().count(), TRUNCATE_CHARS);
    }

    #[test]
    fn clip_str_multibyte_clips_on_char_boundary() {
        // 4-byte char × 250 = 250 chars / 1000 bytes. Clip to 200 chars.
        let s: String = "𝄞".repeat(250);
        let out = clip_str(&s, TRUNCATE_CHARS);
        assert_eq!(out.chars().count(), TRUNCATE_CHARS);
        assert!(out.chars().all(|c| c == '𝄞'));
    }

    #[test]
    fn realtime_datapoint_serializes_scores_as_passthrough_string() {
        let row = CHEvaluationDatapoint {
            id: Uuid::nil(),
            evaluation_id: Uuid::nil(),
            project_id: Uuid::nil(),
            trace_id: Uuid::nil(),
            updated_at: 0,
            data: "{}".into(),
            target: "{}".into(),
            metadata: "{}".into(),
            executor_output: String::new(),
            index: 0,
            dataset_id: Uuid::nil(),
            dataset_datapoint_id: Uuid::nil(),
            dataset_datapoint_created_at: 0,
            group_id: "default".into(),
            scores: r#"{"accuracy":0.9}"#.into(),
        };
        let dp = RealtimeDatapoint::from_ch_insert(&row);
        let v = serde_json::to_value(&dp).unwrap();
        // Scores arrive as a single string field — frontend handles flattening.
        assert_eq!(v["scores"], json!(r#"{"accuracy":0.9}"#));
    }
}
