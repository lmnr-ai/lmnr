//! Per-message dedup of an LLM span's `input` / `output` arrays.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    ContentHash, SeenMarks, SharedContentBatch, content_hash, is_seen, span_group_id,
    storage_seen_key, trace_new_key,
};
use crate::{cache::Cache, db::spans::Span, utils::sanitize_string};

/// Producer's verdict for one message array. `trace_new_indices` are the
/// positions this trace hasn't seen yet; `trace_new_contents` is aligned with
/// it and always carries their JSON, because Quickwit indexes a trace's first
/// occurrence even when the bytes are already stored from another trace.
/// `storage_miss_offsets` indexes into `trace_new_*` and marks the subset the
/// consumer must also insert (storage-miss implies trace-new, so one content
/// array covers both). Everything else rides the wire as hashes only.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MessageDedup {
    pub hashes: Vec<ContentHash>,
    #[serde(default)]
    pub trace_new_indices: Vec<u16>,
    #[serde(default)]
    pub trace_new_contents: Vec<String>,
    #[serde(default)]
    pub storage_miss_offsets: Vec<u16>,
}

/// Producer-side: hash each message and consult both Redis axes. `None` when
/// the span isn't an LLM span or `value` isn't a non-empty array — an empty
/// `Some([])` keeps its wire shape so `CHSpan.input/output` round-trips as `[]`.
pub async fn build_message_dedup(
    span: &Span,
    value: Option<&Value>,
    cache: &Cache,
) -> Option<MessageDedup> {
    if !span.is_llm_span() {
        return None;
    }
    let items = match value? {
        Value::Array(items) if !items.is_empty() => items,
        _ => return None,
    };
    let group_id = span_group_id(span);

    let mut hashes: Vec<ContentHash> = Vec::with_capacity(items.len());
    let mut trace_new_indices: Vec<u16> = Vec::new();
    let mut trace_new_contents: Vec<String> = Vec::new();
    let mut storage_miss_offsets: Vec<u16> = Vec::new();
    let mut seen_in_span: HashSet<ContentHash> = HashSet::new();

    for (idx, item) in items.iter().enumerate() {
        let hash = content_hash(item);
        hashes.push(hash);
        let Ok(pos) = u16::try_from(idx) else {
            continue;
        };

        let trace_seen =
            is_seen(cache, &trace_new_key(span.project_id, span.trace_id, &hash)).await;
        if trace_seen || !seen_in_span.insert(hash) {
            continue;
        }

        // Ingest-order JSON (serde `preserve_order`) so reads reconstruct
        // byte-identical to the non-dedup path; only the hash is canonical.
        let offset = trace_new_indices.len() as u16;
        trace_new_indices.push(pos);
        trace_new_contents.push(sanitize_string(&item.to_string()));

        if !is_seen(cache, &storage_seen_key(span.project_id, &group_id, &hash)).await {
            storage_miss_offsets.push(offset);
        }
    }

    Some(MessageDedup {
        hashes,
        trace_new_indices,
        trace_new_contents,
        storage_miss_offsets,
    })
}

/// Consumer-side resolution of one field's verdicts across a batch, every
/// `Vec` aligned with the spans slice it was built from. `span_content_bytes`
/// is what each span newly added to the shared batch (a hash shared within the
/// flush bills its first referrer only). `span_trace_new_contents` feeds
/// Quickwit and, for storage-miss positions, duplicates the shared row — the
/// PII redactor rewrites both copies.
pub struct MessageBatch {
    pub span_hashes: Vec<Vec<ContentHash>>,
    pub span_content_bytes: Vec<usize>,
    pub span_new_indices: Vec<Vec<u16>>,
    pub span_trace_new_contents: Vec<Vec<String>>,
}

impl MessageBatch {
    /// Spans without a verdict (non-LLM, non-array field, legacy producer)
    /// resolve to empty hashes, the same fall-through as the non-dedup path.
    pub fn build(
        spans: &[&Span],
        dedups: &[Option<MessageDedup>],
        shared: &mut SharedContentBatch,
    ) -> Self {
        debug_assert_eq!(spans.len(), dedups.len());
        let mut batch = MessageBatch {
            span_hashes: Vec::with_capacity(spans.len()),
            span_content_bytes: Vec::with_capacity(spans.len()),
            span_new_indices: Vec::with_capacity(spans.len()),
            span_trace_new_contents: Vec::with_capacity(spans.len()),
        };

        for (span, dedup) in spans.iter().zip(dedups) {
            let Some(dedup) = dedup else {
                batch.push_empty();
                continue;
            };
            let group_id = span_group_id(span);
            let storage_miss: HashSet<u16> = dedup.storage_miss_offsets.iter().copied().collect();

            let mut content_bytes = 0;
            let mut trace_new_contents = Vec::with_capacity(dedup.trace_new_indices.len());
            // Bounds-checked: a malformed wire verdict skips its bad entries
            // instead of panicking and requeueing the whole flush forever.
            for (offset, &pos) in dedup.trace_new_indices.iter().enumerate() {
                let (Some(&hash), Some(content)) = (
                    dedup.hashes.get(pos as usize),
                    dedup.trace_new_contents.get(offset),
                ) else {
                    continue;
                };
                trace_new_contents.push(content.clone());
                if storage_miss.contains(&(offset as u16)) {
                    content_bytes += shared.insert(span.project_id, &group_id, hash, content);
                }
            }

            batch.span_hashes.push(dedup.hashes.clone());
            batch.span_content_bytes.push(content_bytes);
            batch.span_new_indices.push(dedup.trace_new_indices.clone());
            batch.span_trace_new_contents.push(trace_new_contents);
        }
        batch
    }

    fn push_empty(&mut self) {
        self.span_hashes.push(Vec::new());
        self.span_content_bytes.push(0);
        self.span_new_indices.push(Vec::new());
        self.span_trace_new_contents.push(Vec::new());
    }

    /// Trace-new marks for every position this batch recorded as a first
    /// occurrence, storage hit or not.
    pub fn trace_new_marks(&self, spans: &[&Span], marks: &mut SeenMarks) {
        for ((span, hashes), positions) in spans
            .iter()
            .zip(&self.span_hashes)
            .zip(&self.span_new_indices)
        {
            for &pos in positions {
                if let Some(hash) = hashes.get(pos as usize) {
                    marks.trace_new(span.project_id, span.trace_id, hash);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::json;
    use uuid::Uuid;

    use super::*;
    use crate::{
        cache::{CacheTrait, in_memory::InMemoryCache},
        db::spans::SpanType,
    };

    fn make_cache() -> Arc<Cache> {
        Arc::new(Cache::InMemory(InMemoryCache::new(None)))
    }

    fn llm_span(project_id: Uuid, trace_id: Uuid, input: Value) -> Span {
        Span {
            span_type: SpanType::LLM,
            project_id,
            trace_id,
            input: Some(input),
            ..Default::default()
        }
    }

    #[test]
    fn wire_shape_roundtrips_and_missing_fields_default() {
        let dedup = MessageDedup {
            hashes: vec![[0u8; 32]],
            trace_new_indices: vec![0],
            trace_new_contents: vec!["{}".to_string()],
            storage_miss_offsets: vec![],
        };
        let back: MessageDedup =
            serde_json::from_str(&serde_json::to_string(&dedup).unwrap()).unwrap();
        assert_eq!(back.trace_new_indices, vec![0]);
        assert_eq!(back.storage_miss_offsets, Vec::<u16>::new());

        let zero_hash = format!("[{}]", vec!["0"; 32].join(","));
        let minimal: MessageDedup =
            serde_json::from_str(&format!(r#"{{"hashes":[{zero_hash}]}}"#)).unwrap();
        assert!(minimal.trace_new_indices.is_empty());
    }

    #[tokio::test]
    async fn returns_none_for_empty_input_array() {
        let span = llm_span(Uuid::new_v4(), Uuid::new_v4(), json!([]));
        assert!(
            build_message_dedup(&span, span.input.as_ref(), &make_cache())
                .await
                .is_none()
        );
    }

    #[tokio::test]
    async fn first_occurrence_is_trace_new_and_storage_miss() {
        let span = llm_span(
            Uuid::new_v4(),
            Uuid::new_v4(),
            json!([{"role": "user", "content": "hi"}]),
        );
        let dedup = build_message_dedup(&span, span.input.as_ref(), &make_cache())
            .await
            .unwrap();
        assert_eq!(dedup.hashes.len(), 1);
        assert_eq!(dedup.trace_new_indices, vec![0]);
        assert_eq!(dedup.trace_new_contents.len(), 1);
        assert_eq!(dedup.storage_miss_offsets, vec![0]);
    }

    #[tokio::test]
    async fn storage_hit_in_same_group_still_ships_content_for_new_trace() {
        // Two traces in one session share the group: the second trace is a
        // storage hit (no insert) but trace-new (content travels for Quickwit).
        let project_id = Uuid::new_v4();
        let cache = make_cache();
        let msg = json!({"role": "user", "content": "hi"});
        let hash = content_hash(&msg);
        let stamped = storage_seen_key(project_id, "sess", &hash);
        cache.insert_with_ttl(&stamped, "1", 60).await.unwrap();

        let mut span = llm_span(project_id, Uuid::new_v4(), json!([msg]));
        span.attributes.raw_attributes.insert(
            "lmnr.association.properties.session_id".to_string(),
            json!("sess"),
        );
        let dedup = build_message_dedup(&span, span.input.as_ref(), &cache)
            .await
            .unwrap();
        assert_eq!(dedup.trace_new_indices, vec![0]);
        assert_eq!(dedup.trace_new_contents.len(), 1);
        assert!(dedup.storage_miss_offsets.is_empty());
    }

    #[tokio::test]
    async fn storage_key_is_scoped_by_group() {
        // The same content stamped under another group is a miss here — the
        // read side looks it up under this span's group.
        let project_id = Uuid::new_v4();
        let cache = make_cache();
        let msg = json!({"role": "user", "content": "hi"});
        let hash = content_hash(&msg);
        cache
            .insert_with_ttl(&storage_seen_key(project_id, "other", &hash), "1", 60)
            .await
            .unwrap();

        let span = llm_span(project_id, Uuid::new_v4(), json!([msg]));
        let dedup = build_message_dedup(&span, span.input.as_ref(), &cache)
            .await
            .unwrap();
        assert_eq!(dedup.storage_miss_offsets, vec![0]);
    }

    #[tokio::test]
    async fn within_trace_repeat_is_not_trace_new() {
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        let cache = make_cache();
        let msg = json!({"role": "user", "content": "hi"});
        let hash = content_hash(&msg);
        cache
            .insert_with_ttl(&trace_new_key(project_id, trace_id, &hash), "1", 60)
            .await
            .unwrap();

        let span = llm_span(project_id, trace_id, json!([msg.clone(), msg]));
        let dedup = build_message_dedup(&span, span.input.as_ref(), &cache)
            .await
            .unwrap();
        assert_eq!(dedup.hashes.len(), 2);
        assert!(dedup.trace_new_indices.is_empty());
        assert!(dedup.trace_new_contents.is_empty());
    }

    #[tokio::test]
    async fn batch_keeps_storage_hit_content_for_quickwit_and_marks_trace_new() {
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        let cache = make_cache();
        let msg = json!({"role": "system", "content": "you are helpful"});
        let hash = content_hash(&msg);
        cache
            .insert_with_ttl(
                &storage_seen_key(project_id, &trace_id.to_string(), &hash),
                "1",
                60,
            )
            .await
            .unwrap();

        let span = llm_span(project_id, trace_id, json!([msg]));
        let dedup = build_message_dedup(&span, span.input.as_ref(), &cache)
            .await
            .unwrap();

        let mut shared = SharedContentBatch::default();
        let batch = MessageBatch::build(&[&span], &[Some(dedup)], &mut shared);
        assert!(shared.is_empty(), "storage hit — nothing to insert");
        assert_eq!(batch.span_content_bytes, vec![0]);
        assert!(batch.span_trace_new_contents[0][0].contains("you are helpful"));

        let mut marks = SeenMarks::default();
        batch.trace_new_marks(&[&span], &mut marks);
        assert!(!marks.is_empty());
    }

    #[test]
    fn batch_inserts_storage_miss_under_span_group_once() {
        let project_id = Uuid::new_v4();
        let trace_id = Uuid::new_v4();
        let msg = json!({"role": "user", "content": "hi"});
        let dedup = MessageDedup {
            hashes: vec![content_hash(&msg)],
            trace_new_indices: vec![0],
            trace_new_contents: vec![msg.to_string()],
            storage_miss_offsets: vec![0],
        };
        let a = llm_span(project_id, trace_id, json!([msg]));
        let b = a.clone();

        let mut shared = SharedContentBatch::default();
        let batch =
            MessageBatch::build(&[&a, &b], &[Some(dedup.clone()), Some(dedup)], &mut shared);
        assert_eq!(shared.len(), 1);
        assert_eq!(shared.rows()[0].group_id, trace_id.to_string());
        assert!(batch.span_content_bytes[0] > 0);
        assert_eq!(batch.span_content_bytes[1], 0);
    }
}
