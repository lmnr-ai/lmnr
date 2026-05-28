//! Tool-definition dedup, project-scoped.
//!
//! Tool definitions reach LLM spans through several OTel attribute shapes:
//! - `ai.prompt.tools` (Vercel AI SDK) — array of objects (already
//!   reified from JSON strings by `convert_ai_sdk_tool_calls`).
//! - `llm.request.functions.{N}.name|parameters|description` (OpenLLMetry /
//!   LangChain) — split across indexed attributes; reassembled here.
//! - `gen_ai.tool.definitions` (OTel GenAI semconv) — single attribute, JSON
//!   array (or JSON-encoded string).
//!
//! The producer normalizes whichever shape is present into a canonical JSON
//! array, hashes the array as a single blob (BLAKE3 over canonical JSON), and
//! consults Redis to decide whether to ship the content. The consumer treats
//! the verdict as authoritative — same `shared_content` table backs both
//! message and tool-definition dedup, so a tool-definitions blob and an LLM
//! message that hash identically (won't, in practice) would collapse to one
//! row.
//!
//! After extraction the source attributes are stripped from `raw_attributes`
//! so they don't ride the wire OR end up in `CHSpan.attributes`. The `tools`
//! virtual column on `spans_v0` is the canonical read path.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::cache::{Cache, CacheTrait};
use crate::ch::shared_content::CHSharedContent;
use crate::db::spans::Span;
use crate::traces::input_dedup::canonical_json;
use crate::utils::sanitize_string;

fn storage_seen_key(project_id: Uuid, hash: &[u8; 32]) -> String {
    // Same `s:` namespace as messages — the `shared_content` table is
    // content-addressed, so a tool-definition row and a message row that
    // hashed to the same value would collapse cleanly. Sharing the namespace
    // keeps the read-side `shared_content_dict` lookup uniform.
    format!("s:{}:{}", project_id.simple(), hex::encode(hash))
}

/// Names of the source attributes we extract tool definitions from. After a
/// successful normalize the producer strips these from `raw_attributes`.
pub const TOOL_DEFINITION_ATTRIBUTE_KEYS: &[&str] = &["ai.prompt.tools", "gen_ai.tool.definitions"];

/// True when the attribute key participates in tool-definition extraction —
/// covers both single-attribute shapes and the indexed `llm.request.functions.{N}.*`
/// family. Used by `should_keep_attribute` to filter legacy attributes
/// defensively (tool extraction strips them on the producer when present).
pub fn is_tool_definition_attribute(attribute: &str) -> bool {
    if TOOL_DEFINITION_ATTRIBUTE_KEYS.contains(&attribute) {
        return true;
    }
    attribute.starts_with("llm.request.functions.")
}

/// Producer's verdict for a span's normalized tool-definition blob.
///
/// `hash` is the BLAKE3 hash of the canonical JSON of the tool-definitions
/// array. `content` is `Some(...)` only when storage hasn't seen this hash
/// recently (Redis miss) — the consumer inserts it into `messages`. On
/// storage-hit the hash alone rides the wire.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ToolDedup {
    pub hash: [u8; 32],
    pub content: Option<String>,
}

/// Pull tool definitions out of `raw_attributes` and return them as a single
/// JSON array. Attempts the three known shapes in priority order. Returns
/// `None` when no tool definitions are present OR when present-but-malformed
/// (validation failed before commit) — in which case the source attributes
/// are left in place so the legacy attribute-blob renderer can still surface
/// them for the user.
///
/// Validation runs on a borrowed peek; only after the shape is confirmed
/// extractable does the function commit by `remove`-ing the source keys
/// (so they don't ride the wire and don't double-bill against the dedup'd
/// `messages` insert). A bad value is therefore non-destructive: the
/// attribute survives into `CHSpan.attributes` and the frontend's
/// `extractToolsFromAttributes` fallback still works.
fn extract_tool_definitions(
    attrs: &mut std::collections::HashMap<String, Value>,
) -> Option<Vec<Value>> {
    // ai.prompt.tools — Vercel AI SDK, already reified to objects.
    if let Some(Value::Array(arr)) = attrs.get("ai.prompt.tools")
        && !arr.is_empty()
    {
        // Validation passed — commit the removal.
        if let Some(Value::Array(arr)) = attrs.remove("ai.prompt.tools") {
            return Some(arr);
        }
    }

    // gen_ai.tool.definitions — OTel GenAI. Either a JSON array Value or a
    // JSON-encoded string. Peek-then-parse so a malformed JSON string leaves
    // the attribute in place for the legacy fallback.
    let genai_arr = match attrs.get("gen_ai.tool.definitions") {
        Some(Value::String(s)) => serde_json::from_str::<Value>(s).ok().and_then(|v| match v {
            Value::Array(arr) if !arr.is_empty() => Some(arr),
            _ => None,
        }),
        Some(Value::Array(arr)) if !arr.is_empty() => Some(arr.clone()),
        _ => None,
    };
    if let Some(arr) = genai_arr {
        // Validation passed — commit the removal.
        attrs.remove("gen_ai.tool.definitions");
        return Some(arr);
    }

    // llm.request.functions.{N}.{name|parameters|description|arguments|input_schema}
    // — OpenLLMetry / LangChain. Reassemble per index. Build the tools list
    // entirely from peeked clones first; only commit (remove) once we know
    // the extraction yielded at least one non-empty tool object.
    let mut indices: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();
    for key in attrs.keys() {
        if let Some(rest) = key.strip_prefix("llm.request.functions.") {
            if let Some((idx_str, _)) = rest.split_once('.') {
                if let Ok(idx) = idx_str.parse::<u32>() {
                    indices.insert(idx);
                }
            }
        }
    }
    if !indices.is_empty() {
        let mut tools: Vec<Value> = Vec::with_capacity(indices.len());
        for idx in &indices {
            let prefix = format!("llm.request.functions.{idx}.");
            let name = attrs.get(&format!("{prefix}name")).cloned();
            let description = attrs.get(&format!("{prefix}description")).cloned();
            let parameters = attrs
                .get(&format!("{prefix}parameters"))
                .cloned()
                .or_else(|| attrs.get(&format!("{prefix}input_schema")).cloned())
                .or_else(|| attrs.get(&format!("{prefix}arguments")).cloned());

            let mut tool = serde_json::Map::new();
            if let Some(n) = name {
                tool.insert("name".to_string(), n);
            }
            if let Some(d) = description {
                tool.insert("description".to_string(), d);
            }
            if let Some(p) = parameters {
                // Parameters are sometimes serialized as a JSON string by the
                // instrumentation. Reify so the canonical-JSON hash is stable
                // regardless of which side did the encoding.
                let p = match p {
                    Value::String(s) => {
                        serde_json::from_str::<Value>(&s).unwrap_or(Value::String(s))
                    }
                    other => other,
                };
                tool.insert("parameters".to_string(), p);
            }
            if !tool.is_empty() {
                tools.push(Value::Object(tool));
            }
        }
        if !tools.is_empty() {
            // Validation passed — commit by removing every contributing key.
            for idx in &indices {
                let prefix = format!("llm.request.functions.{idx}.");
                attrs.remove(&format!("{prefix}name"));
                attrs.remove(&format!("{prefix}description"));
                attrs.remove(&format!("{prefix}parameters"));
                attrs.remove(&format!("{prefix}input_schema"));
                attrs.remove(&format!("{prefix}arguments"));
            }
            return Some(tools);
        }
    }

    None
}

/// Producer-side: extract + hash tool definitions for one LLM span; consult
/// Redis to decide whether to ship content. Strips the source attributes
/// from `raw_attributes` on success. Returns `None` when the span is not an
/// LLM span or has no tool definitions.
pub async fn build_tool_dedup(span: &mut Span, cache: Arc<Cache>) -> Option<ToolDedup> {
    if !span.is_llm_span() {
        return None;
    }

    let tools = extract_tool_definitions(&mut span.attributes.raw_attributes)?;
    let array = Value::Array(tools);
    let canonical = canonical_json(&array);
    let hash: [u8; 32] = *blake3::hash(canonical.as_bytes()).as_bytes();

    let key = storage_seen_key(span.project_id, &hash);
    let already_seen = cache.exists(&key).await.unwrap_or(false);
    let content = if already_seen {
        None
    } else {
        // Ingest-order JSON for byte-identical reads.
        Some(sanitize_string(&array.to_string()))
    };

    Some(ToolDedup { hash, content })
}

/// Consumer-side: resolve a per-span [`ToolDedup`] verdict against the
/// shared cross-span batch state. Returns the bytes (if any) the span
/// caused to be inserted — the caller bills only the first referrer of a
/// given hash within the batch, matching the message-dedup billing model.
pub fn resolve_tool_dedup(
    span: &Span,
    dedup: &ToolDedup,
    seen_storage_in_batch: &mut std::collections::HashSet<(Uuid, [u8; 32])>,
    shared_content: &mut Vec<CHSharedContent>,
) -> usize {
    let Some(content) = &dedup.content else {
        return 0;
    };
    if !seen_storage_in_batch.insert((span.project_id, dedup.hash)) {
        return 0;
    }
    let bytes = content.len();
    shared_content.push(CHSharedContent {
        project_id: span.project_id,
        content_hash: dedup.hash,
        content: content.clone(),
    });
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::in_memory::InMemoryCache;
    use crate::db::spans::SpanType;
    use crate::traces::spans::SpanAttributes;
    use serde_json::json;
    use std::collections::HashMap;

    fn make_cache() -> Arc<Cache> {
        Arc::new(Cache::InMemory(InMemoryCache::new(None)))
    }

    fn llm_span_with_attrs(attrs: HashMap<String, Value>) -> Span {
        Span {
            span_type: SpanType::LLM,
            project_id: Uuid::new_v4(),
            trace_id: Uuid::new_v4(),
            attributes: SpanAttributes::new(attrs),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn extracts_ai_prompt_tools_and_strips_attribute() {
        let attrs = HashMap::from([(
            "ai.prompt.tools".to_string(),
            json!([
                {"type": "function", "name": "get_weather", "description": "x"},
                {"type": "function", "name": "get_time", "description": "y"},
            ]),
        )]);
        let mut span = llm_span_with_attrs(attrs);
        let dedup = build_tool_dedup(&mut span, make_cache()).await.unwrap();
        assert!(dedup.content.is_some());
        assert!(
            !span
                .attributes
                .raw_attributes
                .contains_key("ai.prompt.tools"),
            "source attribute must be stripped after extraction"
        );
    }

    #[tokio::test]
    async fn extracts_indexed_llm_request_functions() {
        let attrs = HashMap::from([
            (
                "llm.request.functions.0.name".to_string(),
                json!("get_weather"),
            ),
            (
                "llm.request.functions.0.description".to_string(),
                json!("Get weather"),
            ),
            (
                "llm.request.functions.0.parameters".to_string(),
                json!("{\"type\":\"object\"}"),
            ),
            (
                "llm.request.functions.1.name".to_string(),
                json!("get_time"),
            ),
        ]);
        let mut span = llm_span_with_attrs(attrs);
        let dedup = build_tool_dedup(&mut span, make_cache()).await.unwrap();
        let parsed: Value = serde_json::from_str(dedup.content.as_ref().unwrap()).unwrap();
        let arr = parsed.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["name"], "get_weather");
        // Parameters reified from string to object.
        assert!(arr[0]["parameters"].is_object());
        assert_eq!(arr[1]["name"], "get_time");
        // All source attrs stripped.
        for k in span.attributes.raw_attributes.keys() {
            assert!(!k.starts_with("llm.request.functions."));
        }
    }

    #[tokio::test]
    async fn returns_none_when_no_tools_present() {
        let mut span = llm_span_with_attrs(HashMap::new());
        assert!(build_tool_dedup(&mut span, make_cache()).await.is_none());
    }

    #[tokio::test]
    async fn malformed_genai_tool_definitions_string_preserves_attribute() {
        // Regression: pre-fix the malformed JSON string was `remove`d before
        // parsing, so when parsing failed the function returned None AND the
        // attribute was permanently lost. With the peek-validate-commit fix,
        // a malformed value must survive into `raw_attributes` so the legacy
        // `extractToolsFromAttributes` frontend fallback can still render it.
        let attrs = HashMap::from([(
            "gen_ai.tool.definitions".to_string(),
            json!("not actually json"),
        )]);
        let mut span = llm_span_with_attrs(attrs);
        let dedup = build_tool_dedup(&mut span, make_cache()).await;
        assert!(dedup.is_none());
        assert!(
            span.attributes
                .raw_attributes
                .contains_key("gen_ai.tool.definitions"),
            "malformed value must NOT be silently dropped"
        );
    }

    #[tokio::test]
    async fn empty_ai_prompt_tools_array_preserves_attribute() {
        // An empty array is not extractable (nothing to dedup) but still
        // must not be silently dropped — round-tripping `[]` through the
        // attributes blob is the user-visible truth.
        let attrs = HashMap::from([("ai.prompt.tools".to_string(), json!([]))]);
        let mut span = llm_span_with_attrs(attrs);
        let dedup = build_tool_dedup(&mut span, make_cache()).await;
        assert!(dedup.is_none());
        assert!(
            span.attributes
                .raw_attributes
                .contains_key("ai.prompt.tools"),
            "empty array must NOT be silently dropped"
        );
    }

    #[tokio::test]
    async fn non_array_ai_prompt_tools_preserves_attribute() {
        // Some instrumentation might emit `ai.prompt.tools` as an object.
        // Wrong shape — not extractable — but must not be dropped.
        let attrs = HashMap::from([(
            "ai.prompt.tools".to_string(),
            json!({"unexpected": "shape"}),
        )]);
        let mut span = llm_span_with_attrs(attrs);
        let dedup = build_tool_dedup(&mut span, make_cache()).await;
        assert!(dedup.is_none());
        assert!(
            span.attributes
                .raw_attributes
                .contains_key("ai.prompt.tools"),
            "non-array must NOT be silently dropped"
        );
    }

    #[tokio::test]
    async fn storage_hit_strips_content() {
        let attrs = HashMap::from([(
            "ai.prompt.tools".to_string(),
            json!([{"type": "function", "name": "get_weather"}]),
        )]);
        let mut span = llm_span_with_attrs(attrs.clone());
        let cache = make_cache();
        let first = build_tool_dedup(&mut span, cache.clone()).await.unwrap();

        // Stamp storage as if the consumer had inserted (shared `s:` Redis
        // namespace with messages — `mark_seen` in `message_dedup` is the
        // sole writer).
        cache
            .insert_with_ttl(&storage_seen_key(span.project_id, &first.hash), "1", 3600)
            .await
            .unwrap();

        // Second span with the same project + tools — storage hit.
        let mut span2 = Span {
            project_id: span.project_id,
            attributes: SpanAttributes::new(attrs),
            ..llm_span_with_attrs(HashMap::new())
        };
        let second = build_tool_dedup(&mut span2, cache).await.unwrap();
        assert_eq!(second.hash, first.hash);
        assert!(second.content.is_none(), "storage hit — no content");
    }
}
