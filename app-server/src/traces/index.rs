//! This module indexes spans in a vector database for further semantic search.

use anyhow::Result;
use std::{collections::HashMap, sync::Arc};
use uuid::Uuid;

use crate::{
    db::spans::Span,
    semantic_search::{semantic_search_grpc::index_request::Datapoint, SemanticSearch},
};

use super::span_attributes::SPAN_PATH;

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
) -> Result<()> {
    let input_content = get_indexable_content(span, IndexField::Input);
    let output_content = get_indexable_content(span, IndexField::Output);
    if input_content.is_none() && output_content.is_none() {
        return Ok(());
    }

    let mut points = Vec::new();

    if let Some(input_content) = input_content {
        points.push(create_datapoint(span, input_content, "input"));
    }

    if let Some(output_content) = output_content {
        points.push(create_datapoint(span, output_content, "output"));
    }

    semantic_search
        .index(points, collection_name.to_owned(), true)
        .await?;

    Ok(())
}

fn create_datapoint(span: &Span, content: String, field_type: &str) -> Datapoint {
    let mut data = HashMap::new();
    data.insert("trace_id".to_string(), span.trace_id.to_string());
    data.insert("span_id".to_string(), span.span_id.to_string());
    data.insert("type".to_string(), field_type.to_string());
    if let Some(v) = span.attributes.get(SPAN_PATH) {
        data.insert("path".to_string(), v.to_string());
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
