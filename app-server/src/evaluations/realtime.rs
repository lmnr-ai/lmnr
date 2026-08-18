use std::sync::Arc;

use serde::Serialize;
use uuid::Uuid;

use crate::{
    cache::{Cache, CacheTrait, keys::TRACE_EVALUATION_ID_CACHE_KEY},
    ch::evaluation_datapoints::CHEvaluationDatapoint,
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
};

const TRUNCATE_CHARS: usize = 200;
const TRACE_EVALUATION_ID_TTL_SECONDS: u64 = 86_400;

async fn cache_trace_evaluation_id(
    cache: &Cache,
    project_id: &Uuid,
    trace_id: &Uuid,
    evaluation_id: &Uuid,
) {
    let key = format!(
        "{}:{}:{}",
        TRACE_EVALUATION_ID_CACHE_KEY, project_id, trace_id
    );
    if let Err(e) = cache
        .insert_with_ttl(&key, *evaluation_id, TRACE_EVALUATION_ID_TTL_SECONDS)
        .await
    {
        log::warn!("Failed to cache evaluation_id for {}: {:?}", key, e);
    }
}

pub async fn lookup_trace_evaluation_id(
    cache: &Cache,
    project_id: &Uuid,
    trace_id: &Uuid,
) -> Option<Uuid> {
    let key = format!(
        "{}:{}:{}",
        TRACE_EVALUATION_ID_CACHE_KEY, project_id, trace_id
    );
    match cache.get::<Uuid>(&key).await {
        Ok(Some(eval_id)) => Some(eval_id),
        Ok(None) => None,
        Err(e) => {
            log::warn!("Failed to read evaluation_id cache for {}: {:?}", key, e);
            None
        }
    }
}

pub async fn cache_inserted_datapoint_trace_ids(
    cache: Arc<Cache>,
    project_id: &Uuid,
    evaluation_id: &Uuid,
    rows: &[CHEvaluationDatapoint],
) {
    for row in rows {
        if row.trace_id.is_nil() {
            continue;
        }
        cache_trace_evaluation_id(&cache, project_id, &row.trace_id, evaluation_id).await;
    }
}

/// Lightweight datapoint payload sent over SSE.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeDatapoint<'a> {
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
    pub fn from_ch_insert(row: &'a CHEvaluationDatapoint) -> Self {
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

    pub fn from_update_strings(
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

/// Project-level list channel. The per-eval `evaluation_{id}` key is unchanged
/// (detail page); this extra hop lets the evaluations table subscribe once.
pub const EVALUATIONS_LIST_KEY: &str = "evaluations";

/// Detail-page datapoint upsert. Serializes the full `RealtimeDatapoint`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DatapointUpsert<'a> {
    evaluation_id: &'a Uuid,
    group_id: &'a str,
    datapoints: &'a [RealtimeDatapoint<'a>],
}

/// List-channel datapoint. Field set IS the cut — a new body field on
/// `RealtimeDatapoint` cannot leak here.
#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
struct ListDatapoint<'a> {
    id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    index: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    scores: Option<&'a str>,
}

impl<'a> From<&RealtimeDatapoint<'a>> for ListDatapoint<'a> {
    fn from(dp: &RealtimeDatapoint<'a>) -> Self {
        Self {
            id: dp.id,
            index: dp.index,
            scores: dp.scores,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ListDatapointUpsert<'a> {
    evaluation_id: &'a Uuid,
    group_id: &'a str,
    datapoints: Vec<ListDatapoint<'a>>,
}

impl<'a> ListDatapointUpsert<'a> {
    fn from_datapoints(
        evaluation_id: &'a Uuid,
        group_id: &'a str,
        datapoints: &'a [RealtimeDatapoint<'a>],
    ) -> Self {
        Self {
            evaluation_id,
            group_id,
            datapoints: datapoints.iter().map(ListDatapoint::from).collect(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvaluationTraceUpdate<'a, T: Serialize> {
    evaluation_id: &'a Uuid,
    traces: &'a [T],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ListTraceUpdate<'a> {
    evaluation_id: &'a Uuid,
}

fn sse_message(event_type: &str, data: impl Serialize) -> SseMessage {
    SseMessage {
        event_type: event_type.to_string(),
        data: serde_json::to_value(data).expect("sse payload"),
    }
}

pub async fn send_datapoint_updates(
    pubsub: &PubSub,
    project_id: &Uuid,
    evaluation_id: &Uuid,
    group_id: &str,
    datapoints: &[RealtimeDatapoint<'_>],
) {
    if datapoints.is_empty() {
        return;
    }
    let key = format!("evaluation_{}", evaluation_id);
    send_to_key(
        pubsub,
        project_id,
        &key,
        sse_message(
            "datapoint_upsert",
            DatapointUpsert {
                evaluation_id,
                group_id,
                datapoints,
            },
        ),
    )
    .await;
    send_to_key(
        pubsub,
        project_id,
        EVALUATIONS_LIST_KEY,
        sse_message(
            "datapoint_upsert",
            ListDatapointUpsert::from_datapoints(evaluation_id, group_id, datapoints),
        ),
    )
    .await;
}

pub async fn send_evaluation_created(
    pubsub: &PubSub,
    project_id: &Uuid,
    evaluation: &crate::db::evaluations::Evaluation,
) {
    send_to_key(
        pubsub,
        project_id,
        EVALUATIONS_LIST_KEY,
        sse_message(
            "evaluation_created",
            serde_json::json!({ "evaluation": evaluation }),
        ),
    )
    .await;
}

pub async fn send_evaluation_trace_updates<T: Serialize>(
    pubsub: &PubSub,
    project_id: &Uuid,
    evaluation_id: &Uuid,
    traces: &[T],
) {
    if traces.is_empty() {
        return;
    }
    let key = format!("evaluation_{}", evaluation_id);
    send_to_key(
        pubsub,
        project_id,
        &key,
        sse_message(
            "trace_update",
            EvaluationTraceUpdate {
                evaluation_id,
                traces,
            },
        ),
    )
    .await;
}

/// List channel: identity only. Successful traces don't move list counters
/// (complete waits on scores via datapoint_upsert); call this for errors.
pub async fn send_evaluations_list_trace_update(
    pubsub: &PubSub,
    project_id: &Uuid,
    evaluation_id: &Uuid,
) {
    send_to_key(
        pubsub,
        project_id,
        EVALUATIONS_LIST_KEY,
        sse_message("trace_update", ListTraceUpdate { evaluation_id }),
    )
    .await;
}

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
    fn non_empty_filters_blank_and_empty_json() {
        assert_eq!(non_empty(""), None);
        assert_eq!(non_empty("   "), None);
        assert_eq!(non_empty("{}"), None);
        assert_eq!(non_empty("[]"), None);
        assert_eq!(non_empty("null"), None);
        assert_eq!(non_empty(r#"{"a":1}"#), Some(r#"{"a":1}"#));
    }

    fn sample_row() -> CHEvaluationDatapoint {
        CHEvaluationDatapoint {
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
        }
    }

    #[test]
    fn realtime_datapoint_serializes_scores_as_passthrough_string() {
        let row = sample_row();
        let dp = RealtimeDatapoint::from_ch_insert(&row);
        let v = serde_json::to_value(&dp).unwrap();
        // Scores arrive as a single string field — frontend handles flattening.
        assert_eq!(v["scores"], json!(r#"{"accuracy":0.9}"#));
    }

    #[test]
    fn from_ch_insert_omits_nil_trace_id_and_empty_jsonish_fields() {
        let row = sample_row();
        let dp = RealtimeDatapoint::from_ch_insert(&row);
        let v = serde_json::to_value(&dp).unwrap();
        // Nil trace_id is skipped, empty `{}` data/target/metadata are skipped,
        // empty executor_output is skipped.
        assert!(v.get("traceId").is_none());
        assert!(v.get("data").is_none());
        assert!(v.get("target").is_none());
        assert!(v.get("metadata").is_none());
        assert!(v.get("output").is_none());
        // index always present on inserts.
        assert_eq!(v["index"], json!(0));
    }

    #[test]
    fn from_ch_insert_keeps_non_empty_trace_id_and_clips_long_data() {
        let trace_id = Uuid::new_v4();
        let long: String = "a".repeat(500);
        let row = CHEvaluationDatapoint {
            trace_id,
            data: long.clone(),
            target: long.clone(),
            executor_output: long,
            ..sample_row()
        };
        let dp = RealtimeDatapoint::from_ch_insert(&row);
        let v = serde_json::to_value(&dp).unwrap();
        assert_eq!(v["traceId"], json!(trace_id.to_string()));
        assert_eq!(v["data"].as_str().unwrap().chars().count(), TRUNCATE_CHARS);
        assert_eq!(
            v["target"].as_str().unwrap().chars().count(),
            TRUNCATE_CHARS
        );
        assert_eq!(
            v["output"].as_str().unwrap().chars().count(),
            TRUNCATE_CHARS
        );
    }

    #[test]
    fn from_update_strings_omits_index_and_static_fields() {
        let id = Uuid::new_v4();
        let dp = RealtimeDatapoint::from_update_strings(id, None, "", "{}");
        let v = serde_json::to_value(&dp).unwrap();
        assert_eq!(v["id"], json!(id.to_string()));
        assert!(v.get("index").is_none());
        assert!(v.get("traceId").is_none());
        assert!(v.get("data").is_none());
        assert!(v.get("target").is_none());
        assert!(v.get("metadata").is_none());
        assert!(v.get("output").is_none());
        assert!(v.get("scores").is_none());
    }

    #[test]
    fn from_update_strings_filters_nil_trace_id_and_passes_through_scores() {
        let id = Uuid::new_v4();
        let dp = RealtimeDatapoint::from_update_strings(
            id,
            Some(Uuid::nil()),
            r#"{"x":1}"#,
            r#"{"a":0.5}"#,
        );
        let v = serde_json::to_value(&dp).unwrap();
        assert!(v.get("traceId").is_none());
        assert_eq!(v["output"], json!(r#"{"x":1}"#));
        assert_eq!(v["scores"], json!(r#"{"a":0.5}"#));
    }

    #[test]
    fn datapoint_upsert_payload_stamps_evaluation_and_group() {
        let eval_id = Uuid::new_v4();
        let row = sample_row();
        let dp = RealtimeDatapoint::from_ch_insert(&row);
        let v = serde_json::to_value(DatapointUpsert {
            evaluation_id: &eval_id,
            group_id: "default",
            datapoints: std::slice::from_ref(&dp),
        })
        .unwrap();
        assert_eq!(v["evaluationId"], json!(eval_id.to_string()));
        assert_eq!(v["groupId"], json!("default"));
        assert!(v["datapoints"].as_array().unwrap().len() == 1);
        // Detail page keeps reading `datapoints`; extra top-level keys are ignored.
        assert_eq!(v["datapoints"][0]["scores"], json!(r#"{"accuracy":0.9}"#));
    }

    #[test]
    fn list_datapoint_projection_cannot_emit_body_fields() {
        let trace_id = Uuid::new_v4();
        let row = CHEvaluationDatapoint {
            trace_id,
            data: r#"{"input":"why was I charged twice"}"#.into(),
            target: "refund the extra charge".into(),
            metadata: r#"{"query_category":"billing"}"#.into(),
            executor_output: "Processed response".into(),
            ..sample_row()
        };
        let dp = RealtimeDatapoint::from_ch_insert(&row);
        let v = serde_json::to_value(ListDatapoint::from(&dp)).unwrap();
        let obj = v.as_object().unwrap();
        assert_eq!(obj.get("id").unwrap(), &json!(row.id.to_string()));
        assert_eq!(obj.get("index").unwrap(), &json!(0));
        assert_eq!(obj.get("scores").unwrap(), &json!(r#"{"accuracy":0.9}"#));
        assert_eq!(obj.len(), 3);
    }

    #[test]
    fn list_datapoint_upsert_payload_drops_body_fields() {
        let eval_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        let row = CHEvaluationDatapoint {
            trace_id,
            data: r#"{"input":"why was I charged twice"}"#.into(),
            target: "refund the extra charge".into(),
            metadata: r#"{"query_category":"billing"}"#.into(),
            executor_output: "Processed response".into(),
            ..sample_row()
        };
        let dp = RealtimeDatapoint::from_ch_insert(&row);
        let v = serde_json::to_value(ListDatapointUpsert::from_datapoints(
            &eval_id,
            "default",
            std::slice::from_ref(&dp),
        ))
        .unwrap();
        assert_eq!(v["evaluationId"], json!(eval_id.to_string()));
        assert_eq!(v["groupId"], json!("default"));
        let dp_v = &v["datapoints"][0];
        assert_eq!(dp_v["id"], json!(row.id.to_string()));
        assert_eq!(dp_v["index"], json!(0));
        assert_eq!(dp_v["scores"], json!(r#"{"accuracy":0.9}"#));
        assert!(dp_v.get("traceId").is_none());
        assert!(dp_v.get("data").is_none());
        assert!(dp_v.get("target").is_none());
        assert!(dp_v.get("metadata").is_none());
        assert!(dp_v.get("output").is_none());
        assert_eq!(dp_v.as_object().unwrap().len(), 3);
    }

    #[test]
    fn list_trace_update_payload_is_evaluation_id_only() {
        let eval_id = Uuid::new_v4();
        let v = serde_json::to_value(ListTraceUpdate {
            evaluation_id: &eval_id,
        })
        .unwrap();
        assert_eq!(v, json!({ "evaluationId": eval_id }));
    }
}
