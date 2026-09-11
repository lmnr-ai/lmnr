//! Structural dedup of LLM span payloads — input messages, output messages,
//! tool definitions — into the content-addressed `unique_content` table.
//!
//! Every blob is BLAKE3-hashed over canonical JSON and stored once per
//! `(project_id, group_id, content_hash)`. The group is the span's session when
//! it has one, else its trace ([`group_id`]): leading the key with it keeps one
//! conversation's content in one contiguous key range, so reconstructing a
//! trace reads a few granules instead of one per message.
//!
//! Two independent Redis axes gate the work:
//! - storage `s2:{project}:{group}:{hash}` — content is already in ClickHouse;
//!   skip the wire bytes and the insert.
//! - trace-new `tn:{project}:{trace}:{hash}` — first occurrence in the trace;
//!   drives `*_new_message_indices` for search and Quickwit indexing.
//!
//! The producer only reads these; the consumer stamps them ([`SeenMarks`]) once
//! the `unique_content` and `spans` inserts are both durable. The one
//! producer-side write is the trace→session hint in [`session`].

pub mod messages;
pub mod session;
pub mod tools;

use std::collections::HashSet;

use serde_json::Value;
use uuid::Uuid;

use crate::{
    cache::{
        Cache, CacheTrait,
        keys::{DEDUP_STORAGE_SEEN_CACHE_KEY, DEDUP_TRACE_NEW_CACHE_KEY},
    },
    ch::unique_content::CHUniqueContent,
    db::spans::Span,
};

pub type ContentHash = [u8; 32];

const SEEN_TTL_SECONDS: u64 = 3600;

/// Locality group of a span's deduped content. Mirrors the view-side
/// `if(session_id != '', session_id, toString(trace_id))` exactly — both sides
/// must derive the same key from the same span row.
pub fn group_id(session_id: &str, trace_id: Uuid) -> String {
    if session_id.is_empty() {
        trace_id.to_string()
    } else {
        session_id.to_string()
    }
}

pub fn span_group_id(span: &Span) -> String {
    group_id(
        span.attributes.session_id().as_deref().unwrap_or(""),
        span.trace_id,
    )
}

pub fn content_hash(value: &Value) -> ContentHash {
    *blake3::hash(canonical_json(value).as_bytes()).as_bytes()
}

/// JSON with sorted object keys — stable hash identity across field-order-only diffs.
pub fn canonical_json(value: &Value) -> String {
    match value {
        Value::Object(map) => {
            let mut entries: Vec<(&String, &Value)> = map.iter().collect();
            entries.sort_by(|a, b| a.0.cmp(b.0));
            let mut out = String::from("{");
            for (i, (k, v)) in entries.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(
                    &serde_json::to_string(k)
                        .expect("serde_json::to_string of a String is infallible"),
                );
                out.push(':');
                out.push_str(&canonical_json(v));
            }
            out.push('}');
            out
        }
        Value::Array(items) => {
            let mut out = String::from("[");
            for (i, v) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&canonical_json(v));
            }
            out.push(']');
            out
        }
        _ => serde_json::to_string(value)
            .expect("serde_json::to_string of a JSON scalar is infallible"),
    }
}

/// Debugger replay-cache key (LAM-1715): hash of the whole message array with
/// every `role == "system"` message dropped, so the agent editing its own system
/// prompt between iterations doesn't change the key. The SDK mirrors this
/// exactly; it is deliberately not `prompt_hash::extract_system_message`.
pub fn debug_input_hash(input: &Value) -> String {
    let messages = match input.as_array() {
        Some(arr) => Value::Array(
            arr.iter()
                .filter(|m| m.get("role").and_then(|r| r.as_str()) != Some("system"))
                .cloned()
                .collect(),
        ),
        None => input.clone(),
    };
    hex::encode(content_hash(&messages))
}

fn storage_seen_key(project_id: Uuid, group_id: &str, hash: &ContentHash) -> String {
    format!(
        "{DEDUP_STORAGE_SEEN_CACHE_KEY}:{}:{group_id}:{}",
        project_id.to_string(),
        hex::encode(hash)
    )
}

fn trace_new_key(project_id: Uuid, trace_id: Uuid, hash: &ContentHash) -> String {
    format!(
        "{DEDUP_TRACE_NEW_CACHE_KEY}:{}:{}:{}",
        project_id.to_string(),
        trace_id.to_string(),
        hex::encode(hash)
    )
}

/// A Redis error reads as "unseen": the cost is a redundant insert the
/// ReplacingMergeTree collapses, never a missing row.
async fn is_seen(cache: &Cache, key: &str) -> bool {
    cache.exists(key).await.unwrap_or(false)
}

/// Redis stamps for one consumer flush. Stamped only after both backing tables
/// are durable: `s2:` keys are backed by `unique_content`, `tn:` keys by
/// `spans.*_new_message_indices`, and a key without its row would make later
/// spans skip content that never landed.
#[derive(Default)]
pub struct SeenMarks {
    keys: Vec<String>,
}

impl SeenMarks {
    pub fn is_empty(&self) -> bool {
        self.keys.is_empty()
    }

    pub fn storage(&mut self, project_id: Uuid, group_id: &str, hash: &ContentHash) {
        self.keys.push(storage_seen_key(project_id, group_id, hash));
    }

    pub fn trace_new(&mut self, project_id: Uuid, trace_id: Uuid, hash: &ContentHash) {
        self.keys.push(trace_new_key(project_id, trace_id, hash));
    }

    pub async fn stamp(&self, cache: &Cache) {
        for key in &self.keys {
            let _ = cache.insert_with_ttl(key, "1", SEEN_TTL_SECONDS).await;
        }
    }
}

/// Rows headed for `unique_content` in one flush. Input, output and tool
/// content share it, so a hash referenced by several spans or fields is inserted
/// and billed once — to the first referrer in batch order.
#[derive(Default)]
pub struct SharedContentBatch {
    rows: Vec<CHUniqueContent>,
    keys: HashSet<(Uuid, String, ContentHash)>,
}

impl SharedContentBatch {
    /// Bytes newly added; 0 when the key was already in the batch.
    pub fn insert(
        &mut self,
        project_id: Uuid,
        group_id: &str,
        hash: ContentHash,
        content: &str,
    ) -> usize {
        if !self.keys.insert((project_id, group_id.to_string(), hash)) {
            return 0;
        }
        self.rows.push(CHUniqueContent::new(
            project_id,
            group_id.to_string(),
            hash,
            content.to_string(),
        ));
        content.len()
    }

    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }

    pub fn len(&self) -> usize {
        self.rows.len()
    }

    pub fn rows(&self) -> &[CHUniqueContent] {
        &self.rows
    }

    /// Mutable for the PII redactor, which rewrites `content` in place.
    pub fn rows_mut(&mut self) -> &mut Vec<CHUniqueContent> {
        &mut self.rows
    }

    /// `skip(row_index)` withholds the mark: an unmarked row is a storage
    /// miss for the next occurrence and gets re-inserted.
    pub fn storage_marks(&self, marks: &mut SeenMarks, skip: impl Fn(usize) -> bool) {
        for (i, row) in self.rows.iter().enumerate() {
            if !skip(i) {
                marks.storage(row.project_id, &row.group_id, &row.content_hash);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn group_is_session_when_present_else_trace() {
        let trace_id = Uuid::new_v4();
        assert_eq!(group_id("sess-1", trace_id), "sess-1");
        // Hyphenated lowercase — what ClickHouse `toString(UUID)` yields.
        assert_eq!(group_id("", trace_id), trace_id.to_string());
    }

    #[test]
    fn top_level_key_order_is_normalized() {
        let a = json!({"role": "user", "content": "hi"});
        let b = json!({"content": "hi", "role": "user"});
        assert_eq!(canonical_json(&a), canonical_json(&b));
        assert_eq!(canonical_json(&a), r#"{"content":"hi","role":"user"}"#);
    }

    #[test]
    fn nested_object_keys_are_sorted_at_every_depth() {
        let v = json!({
            "z": {"b": 1, "a": {"y": 2, "x": 1}},
            "a": [{"k": 2, "j": 1}],
        });
        assert_eq!(
            canonical_json(&v),
            r#"{"a":[{"j":1,"k":2}],"z":{"a":{"x":1,"y":2},"b":1}}"#
        );
    }

    #[test]
    fn array_element_order_is_preserved() {
        assert_eq!(canonical_json(&json!([3, 1, 2])), "[3,1,2]");
        assert_ne!(
            canonical_json(&json!([3, 1, 2])),
            canonical_json(&json!([1, 2, 3]))
        );
    }

    #[test]
    fn content_hash_is_stable_across_field_order() {
        let a = json!({"role": "user", "content": [{"type": "text", "text": "hi"}]});
        let b = json!({"content": [{"text": "hi", "type": "text"}], "role": "user"});
        assert_eq!(content_hash(&a), content_hash(&b));
    }

    #[test]
    fn shared_batch_inserts_and_bills_each_key_once() {
        let project_id = Uuid::new_v4();
        let hash = content_hash(&json!({"role": "user"}));
        let mut batch = SharedContentBatch::default();
        assert_eq!(batch.insert(project_id, "g", hash, "abc"), 3);
        assert_eq!(batch.insert(project_id, "g", hash, "abc"), 0);
        // Same hash under another group is a different row.
        assert_eq!(batch.insert(project_id, "h", hash, "abc"), 3);
        assert_eq!(batch.len(), 2);

        let mut marks = SeenMarks::default();
        batch.storage_marks(&mut marks, |_| false);
        assert_eq!(marks.keys.len(), 2);
        assert!(marks.keys[0].starts_with("s2:"));

        let mut marks = SeenMarks::default();
        batch.storage_marks(&mut marks, |i| i == 0);
        assert_eq!(marks.keys.len(), 1);
    }
}
