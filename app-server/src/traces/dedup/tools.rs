//! Tool-definition dedup: the span's tools, whichever OTel shape they arrive
//! in, normalized to one canonical JSON array and stored as a single blob.
//!
//! Shapes: `ai.prompt.tools` (Vercel AI SDK, already reified to objects),
//! `gen_ai.tool.definitions` (OTel GenAI, array or JSON string), and
//! `llm.request.functions.{N}.*` (OpenLLMetry / LangChain, split across
//! indexed attributes). The source attributes are stripped on extraction so
//! they ride neither the wire nor `CHSpan.attributes`; `spans_v0` exposes the
//! blob as the `tool_definitions` column.

use std::collections::{BTreeSet, HashMap};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    ContentHash, SharedContentBatch, content_hash, is_seen, span_group_id, storage_seen_key,
};
use crate::{cache::Cache, db::spans::Span, utils::sanitize_string};

/// Producer's verdict for a span's tool definitions. `content` is `Some` only
/// on a storage miss; otherwise the hash alone rides the wire.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ToolDedup {
    pub hash: ContentHash,
    pub content: Option<String>,
}

/// Pull tool definitions out of `raw_attributes` as one JSON array, trying the
/// known shapes in priority order. Each shape is validated on a borrowed peek
/// and only then removed, so a malformed value survives into
/// `CHSpan.attributes` for the frontend's attribute-based fallback renderer.
fn extract_tool_definitions(attrs: &mut HashMap<String, Value>) -> Option<Vec<Value>> {
    if let Some(Value::Array(arr)) = attrs.get("ai.prompt.tools")
        && !arr.is_empty()
        && let Some(Value::Array(arr)) = attrs.remove("ai.prompt.tools")
    {
        return Some(arr);
    }

    let genai = match attrs.get("gen_ai.tool.definitions") {
        Some(Value::String(s)) => serde_json::from_str::<Value>(s).ok().and_then(|v| match v {
            Value::Array(arr) if !arr.is_empty() => Some(arr),
            _ => None,
        }),
        Some(Value::Array(arr)) if !arr.is_empty() => Some(arr.clone()),
        _ => None,
    };
    if let Some(arr) = genai {
        attrs.remove("gen_ai.tool.definitions");
        return Some(arr);
    }

    let indices: BTreeSet<u32> = attrs
        .keys()
        .filter_map(|key| key.strip_prefix("llm.request.functions."))
        .filter_map(|rest| rest.split_once('.'))
        .filter_map(|(idx, _)| idx.parse().ok())
        .collect();
    if indices.is_empty() {
        return None;
    }
    let tools: Vec<Value> = indices
        .iter()
        .filter_map(|idx| indexed_function(attrs, *idx))
        .collect();
    if tools.is_empty() {
        return None;
    }
    for idx in &indices {
        for field in INDEXED_FUNCTION_FIELDS {
            attrs.remove(&format!("llm.request.functions.{idx}.{field}"));
        }
    }
    Some(tools)
}

const INDEXED_FUNCTION_FIELDS: [&str; 5] = [
    "name",
    "description",
    "parameters",
    "input_schema",
    "arguments",
];

/// One `llm.request.functions.{idx}.*` group as a tool object; `None` when
/// every field is absent.
fn indexed_function(attrs: &HashMap<String, Value>, idx: u32) -> Option<Value> {
    let get = |field: &str| {
        attrs
            .get(&format!("llm.request.functions.{idx}.{field}"))
            .cloned()
    };
    let mut tool = serde_json::Map::new();
    if let Some(name) = get("name") {
        tool.insert("name".to_string(), name);
    }
    if let Some(description) = get("description") {
        tool.insert("description".to_string(), description);
    }
    if let Some(parameters) = get("parameters")
        .or_else(|| get("input_schema"))
        .or_else(|| get("arguments"))
    {
        // Some instrumentations JSON-encode the schema; reify so the hash is
        // stable regardless of which side did the encoding.
        let parameters = match parameters {
            Value::String(s) => serde_json::from_str::<Value>(&s).unwrap_or(Value::String(s)),
            other => other,
        };
        tool.insert("parameters".to_string(), parameters);
    }
    (!tool.is_empty()).then_some(Value::Object(tool))
}

/// Producer-side: extract, hash and consult storage for one LLM span's tool
/// definitions. `None` when the span isn't an LLM span or has no tools.
pub async fn build_tool_dedup(span: &mut Span, cache: &Cache) -> Option<ToolDedup> {
    if !span.is_llm_span() {
        return None;
    }
    let tools = Value::Array(extract_tool_definitions(
        &mut span.attributes.raw_attributes,
    )?);
    let hash = content_hash(&tools);
    let key = storage_seen_key(span.project_id, &span_group_id(span), &hash);
    let content = if is_seen(cache, &key).await {
        None
    } else {
        Some(sanitize_string(&tools.to_string()))
    };
    Some(ToolDedup { hash, content })
}

/// Consumer-side: add the span's tool blob to the shared batch when the
/// producer shipped it. Returns the bytes this span newly added.
pub fn resolve_tool_dedup(
    span: &Span,
    dedup: &ToolDedup,
    shared: &mut SharedContentBatch,
) -> usize {
    match &dedup.content {
        Some(content) => shared.insert(span.project_id, &span_group_id(span), dedup.hash, content),
        None => 0,
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
        traces::spans::SpanAttributes,
    };

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
        let dedup = build_tool_dedup(&mut span, &make_cache()).await.unwrap();
        assert!(dedup.content.is_some());
        assert!(
            !span
                .attributes
                .raw_attributes
                .contains_key("ai.prompt.tools")
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
        let dedup = build_tool_dedup(&mut span, &make_cache()).await.unwrap();
        let parsed: Value = serde_json::from_str(dedup.content.as_ref().unwrap()).unwrap();
        let arr = parsed.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["name"], "get_weather");
        assert!(
            arr[0]["parameters"].is_object(),
            "schema reified from string"
        );
        assert_eq!(arr[1]["name"], "get_time");
        assert!(
            span.attributes
                .raw_attributes
                .keys()
                .all(|k| !k.starts_with("llm.request.functions."))
        );
    }

    #[tokio::test]
    async fn returns_none_when_no_tools_present() {
        let mut span = llm_span_with_attrs(HashMap::new());
        assert!(build_tool_dedup(&mut span, &make_cache()).await.is_none());
    }

    #[tokio::test]
    async fn malformed_or_empty_values_are_left_in_place() {
        for (key, value) in [
            ("gen_ai.tool.definitions", json!("not actually json")),
            ("ai.prompt.tools", json!([])),
            ("ai.prompt.tools", json!({"unexpected": "shape"})),
        ] {
            let mut span = llm_span_with_attrs(HashMap::from([(key.to_string(), value)]));
            assert!(build_tool_dedup(&mut span, &make_cache()).await.is_none());
            assert!(
                span.attributes.raw_attributes.contains_key(key),
                "{key} must not be silently dropped"
            );
        }
    }

    #[tokio::test]
    async fn storage_hit_strips_content() {
        let attrs = HashMap::from([(
            "ai.prompt.tools".to_string(),
            json!([{"type": "function", "name": "get_weather"}]),
        )]);
        let mut first_span = llm_span_with_attrs(attrs.clone());
        let cache = make_cache();
        let first = build_tool_dedup(&mut first_span, &cache).await.unwrap();

        // Same project and trace (hence group) as the first span.
        let mut second_span = Span {
            attributes: SpanAttributes::new(attrs),
            ..first_span.clone()
        };
        cache
            .insert_with_ttl(
                &storage_seen_key(
                    first_span.project_id,
                    &span_group_id(&first_span),
                    &first.hash,
                ),
                "1",
                60,
            )
            .await
            .unwrap();
        let second = build_tool_dedup(&mut second_span, &cache).await.unwrap();
        assert_eq!(second.hash, first.hash);
        assert!(second.content.is_none());
    }

    #[test]
    fn resolve_bills_first_referrer_only() {
        let mut span = llm_span_with_attrs(HashMap::new());
        span.trace_id = Uuid::new_v4();
        let dedup = ToolDedup {
            hash: [7u8; 32],
            content: Some("[{}]".to_string()),
        };
        let mut shared = SharedContentBatch::default();
        assert_eq!(resolve_tool_dedup(&span, &dedup, &mut shared), 4);
        assert_eq!(resolve_tool_dedup(&span, &dedup, &mut shared), 0);
        assert_eq!(shared.rows()[0].group_id, span.trace_id.to_string());
    }
}
