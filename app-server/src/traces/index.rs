//! This module indexes spans in a vector database for further semantic search.

use anyhow::Result;
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

use crate::{
    chunk::{
        character_split::CharacterSplitParams,
        runner::{ChunkParams, ChunkerRunner, ChunkerType},
    },
    db::spans::Span,
    semantic_search::{semantic_search_grpc::index_request::Datapoint, SemanticSearch},
};

use super::{span_attributes::SPAN_PATH, utils::json_value_to_string};

const THRESHOLD: f32 = 0.0;
const LIMIT: u32 = 3;
const CHARACTER_SPLITTER_CHUNK_SIZE: u32 = 512;
const CHARACTER_SPLITTER_STRIDE: u32 = 256;
const DATASOURCE_ID: &str = "spans";

/// internal enum to choose which span field to index
enum IndexField {
    Input,
    Output,
}

pub async fn index_span(
    span: &Span,
    semantic_search: Arc<dyn SemanticSearch>,
    collection_name: &String,
    chunker_runner: Arc<ChunkerRunner>,
) -> Result<()> {
    let input_content = get_indexable_content(span, IndexField::Input);
    let output_content = get_indexable_content(span, IndexField::Output);
    if input_content.is_none() && output_content.is_none() {
        return Ok(());
    }
    let input_chunks = chunk(chunker_runner.clone(), input_content)?;
    let output_chunks = chunk(chunker_runner.clone(), output_content)?;

    let mut points = input_chunks
        .iter()
        .map(|chunk| create_datapoint(span, chunk.to_string(), "input"))
        .collect::<Vec<_>>();

    let output_points = output_chunks
        .iter()
        .map(|chunk| create_datapoint(span, chunk.to_string(), "output"))
        .collect::<Vec<_>>();

    points.extend(output_points);

    semantic_search
        .index(points, collection_name.to_owned())
        .await?;

    Ok(())
}

pub async fn find_similar_span_ids(
    span: &Span,
    semantic_search: Arc<dyn SemanticSearch>,
    collection_name: &String,
) -> anyhow::Result<Vec<Uuid>> {
    let Some(indexable_content) = get_indexable_content(span, IndexField::Input) else {
        return Ok(Vec::new());
    };

    let mut payloads = vec![HashMap::from([
        ("datasource_id".to_string(), DATASOURCE_ID.to_string()),
        ("data.type".to_string(), "input".to_string()),
    ])];

    if let Some(path) = span.attributes.get(SPAN_PATH) {
        payloads.push(HashMap::from([(
            "data.path".to_string(),
            json_value_to_string(path.clone()),
        )]));
    }

    let response = semantic_search
        .query(
            collection_name,
            indexable_content,
            LIMIT,
            THRESHOLD,
            payloads,
        )
        .await?;

    let similar_points = response
        .results
        .iter()
        .map(|result| Uuid::parse_str(&result.data["span_id"]).unwrap())
        .collect::<Vec<_>>();

    Ok(similar_points)
}

fn chunk(chunker_runner: Arc<ChunkerRunner>, content: Option<String>) -> Result<Vec<String>> {
    let chunks = content
        .map(|content| {
            chunker_runner.chunk(
                &ChunkerType::CharacterSplit,
                &content,
                &ChunkParams::CharacterSplit(CharacterSplitParams {
                    chunk_size: CHARACTER_SPLITTER_CHUNK_SIZE,
                    stride: CHARACTER_SPLITTER_STRIDE,
                }),
            )
        })
        .transpose()?
        .unwrap_or_default();
    Ok(chunks)
}

fn create_datapoint(span: &Span, content: String, field_type: &str) -> Datapoint {
    let mut data = HashMap::new();
    data.insert("trace_id".to_string(), span.trace_id.to_string());
    data.insert("span_id".to_string(), span.span_id.to_string());
    data.insert("type".to_string(), field_type.to_string());
    if let Some(Value::String(path)) = span.attributes.get(SPAN_PATH) {
        data.insert("path".to_string(), path.to_owned());
    };

    Datapoint {
        id: Uuid::new_v4().to_string(),
        data,
        content,
        datasource_id: DATASOURCE_ID.to_string(),
    }
}

fn get_indexable_content(span: &Span, field: IndexField) -> Option<String> {
    let content = match field {
        IndexField::Input => span.input.clone(),
        IndexField::Output => span.output.clone(),
    };
    content.map(|c| c.to_string())
}
