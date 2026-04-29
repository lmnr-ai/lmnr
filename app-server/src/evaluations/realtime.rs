use serde::Serialize;
use uuid::Uuid;

use crate::{
    ch::evaluation_datapoints::CHEvaluationDatapoint,
    pubsub::PubSub,
    realtime::{SseMessage, send_to_key},
};

const TRUNCATE_CHARS: usize = 200;

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

pub async fn publish_datapoint_upsert(
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

pub async fn publish_inserted_datapoints(
    pubsub: &PubSub,
    project_id: &Uuid,
    evaluation_id: &Uuid,
    rows: &[CHEvaluationDatapoint],
) {
    if rows.is_empty() {
        return;
    }
    let payloads: Vec<RealtimeDatapoint<'_>> =
        rows.iter().map(RealtimeDatapoint::from_ch_insert).collect();
    publish_datapoint_upsert(pubsub, project_id, evaluation_id, &payloads).await;
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
        assert_eq!(v["target"].as_str().unwrap().chars().count(), TRUNCATE_CHARS);
        assert_eq!(v["output"].as_str().unwrap().chars().count(), TRUNCATE_CHARS);
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
}
