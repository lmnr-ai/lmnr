//! `sql.query` / `sql.export` events carry the query text in `metadata.query`.
//! Whichever route logged the event, the text is made storable here.

use std::sync::Arc;

use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::{AuditEventInput, AuditResource};
use crate::{
    cache::Cache, data_plane::get_workspace_deployment, db::workspaces::DeploymentMode,
    query_engine::validator::strip_literals,
};

/// Longest query text stored on an event.
const MAX_QUERY_BYTES: usize = 16 * 1024;

/// Hybrid workspaces keep their data in their own data plane, so their query
/// text is stored with literals stripped, or not at all if it can't be parsed.
pub(super) async fn storable_metadata(
    pool: &PgPool,
    cache: Arc<Cache>,
    input: &mut AuditEventInput,
) {
    if input.resource_type != AuditResource::Sql {
        return;
    }
    let Some(project_id) = input.project_id else {
        return;
    };
    let Some(Value::Object(metadata)) = input.metadata.as_mut() else {
        return;
    };
    let Some(Value::String(query)) = metadata.remove("query") else {
        return;
    };
    let query = match loggable_query(pool, cache, project_id, query).await {
        Some(query) => Value::String(truncate_utf8(query, MAX_QUERY_BYTES)),
        None => Value::Null,
    };
    metadata.insert("query".to_string(), query);
}

async fn loggable_query(
    pool: &PgPool,
    cache: Arc<Cache>,
    project_id: Uuid,
    query: String,
) -> Option<String> {
    match get_workspace_deployment(pool, cache, project_id).await {
        Ok(config) if config.mode == DeploymentMode::CLOUD => Some(query),
        _ => strip_literals(&query),
    }
}

fn truncate_utf8(mut s: String, max_bytes: usize) -> String {
    if s.len() > max_bytes {
        let mut end = max_bytes;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        s.truncate(end);
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncation_keeps_whole_characters() {
        assert_eq!(truncate_utf8("abc".to_string(), 10), "abc");
        assert_eq!(truncate_utf8("aé".to_string(), 2), "a");
    }
}
