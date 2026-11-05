//! What a `/v1` request acted on. Handlers name the ids; the resource type
//! comes from the route's classification, and `middleware::audit_v1` turns
//! the targets into the event's `resource_id`, `resource_label` and metadata.

use std::{cell::RefMut, collections::HashMap};

use actix_web::{HttpMessage, HttpRequest, web};
use serde_json::{Map, Value};
use uuid::Uuid;

use super::{
    AuditResource,
    middleware::{Classification, actor, classify, route},
};
use crate::db::DB;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Target {
    pub id: String,
    pub name: Option<String>,
}

/// Request extension holding everything the handler named, in call order.
#[derive(Debug, Clone, Default)]
pub(super) struct Targets {
    pub items: Vec<Target>,
    pub metadata: Map<String, Value>,
}

enum Owner {
    Project,
    Workspace,
}

struct NameSource {
    /// Selects `id`, `name` and `owner_id` for the ids bound as `$1`.
    sql: &'static str,
    owner: Owner,
}

#[derive(sqlx::FromRow)]
struct NameRow {
    id: Uuid,
    name: Option<String>,
    owner_id: Uuid,
}

fn name_source(resource: AuditResource) -> Option<NameSource> {
    use AuditResource::*;
    let (sql, owner) = match resource {
        Dataset => (
            "SELECT id, name, project_id AS owner_id FROM datasets WHERE id = ANY($1)",
            Owner::Project,
        ),
        Signal => (
            "SELECT id, name, project_id AS owner_id FROM signals WHERE id = ANY($1)",
            Owner::Project,
        ),
        Alert => (
            "SELECT id, name, project_id AS owner_id FROM alerts WHERE id = ANY($1)",
            Owner::Project,
        ),
        Dashboard => (
            "SELECT id, name, project_id AS owner_id FROM dashboards WHERE id = ANY($1)",
            Owner::Project,
        ),
        Chart => (
            "SELECT id, name, project_id AS owner_id FROM dashboard_charts WHERE id = ANY($1)",
            Owner::Project,
        ),
        Evaluation => (
            "SELECT id, name, project_id AS owner_id FROM evaluations WHERE id = ANY($1)",
            Owner::Project,
        ),
        DebuggerSession => (
            "SELECT id, name, project_id AS owner_id FROM debugger_sessions WHERE id = ANY($1)",
            Owner::Project,
        ),
        LlmProfile => (
            "SELECT id, name, workspace_id AS owner_id FROM llm_profiles WHERE id = ANY($1)",
            Owner::Workspace,
        ),
        _ => return None,
    };
    Some(NameSource { sql, owner })
}

/// Records the ids this request acted on, with their display names read now.
/// A delete handler must call it before deleting, or the names are gone.
/// Names are kept only for rows the caller's project (or its workspace) owns;
/// ids without one are still recorded. Repeated calls append.
pub async fn target(req: &HttpRequest, ids: impl IntoIterator<Item = impl ToString>) {
    let ids: Vec<String> = ids.into_iter().map(|id| id.to_string()).collect();
    let names = read_names(req, &ids).await.unwrap_or_default();
    let items = ids.into_iter().map(|id| {
        let name = id
            .parse::<Uuid>()
            .ok()
            .and_then(|uuid| names.get(&uuid).cloned());
        Target { id, name }
    });
    targets_mut(req).items.extend(items);
}

/// [`target`] for a handler that already holds the name, e.g. from the row it created.
pub fn target_named(req: &HttpRequest, id: impl ToString, name: impl Into<Option<String>>) {
    let name = name.into().filter(|n| !n.is_empty());
    targets_mut(req).items.push(Target {
        id: id.to_string(),
        name,
    });
}

/// A parent the request touched that is not in its path, e.g. the dataset of created datapoints.
pub fn target_parent(req: &HttpRequest, key: &str, id: impl ToString) {
    targets_mut(req)
        .metadata
        .insert(key.to_string(), Value::String(id.to_string()));
}

fn targets_mut(req: &HttpRequest) -> RefMut<'_, Targets> {
    RefMut::map(req.extensions_mut(), |extensions| {
        extensions.get_or_insert_with(Targets::default)
    })
}

async fn read_names(req: &HttpRequest, ids: &[String]) -> Option<HashMap<Uuid, String>> {
    let (path, _) = route(req)?;
    let Some(Classification::Log { resource, .. }) = classify(req.method(), &path) else {
        return None;
    };
    let source = name_source(resource)?;
    let uuids: Vec<Uuid> = ids.iter().filter_map(|id| id.parse().ok()).collect();
    if uuids.is_empty() {
        return None;
    }
    let (_, project_id) = actor(req)?;
    let db = req.app_data::<web::Data<DB>>()?;
    let owner_id = match source.owner {
        Owner::Project => project_id,
        Owner::Workspace => {
            sqlx::query_scalar::<_, Uuid>("SELECT workspace_id FROM projects WHERE id = $1")
                .bind(project_id)
                .fetch_optional(&db.pool)
                .await
                .ok()??
        }
    };
    let rows = sqlx::query_as::<_, NameRow>(source.sql)
        .bind(&uuids)
        .fetch_all(&db.pool)
        .await;
    let rows = match rows {
        Ok(rows) => rows,
        Err(e) => {
            log::warn!("Failed to read audit target names for {path}: {e:?}");
            return None;
        }
    };
    Some(
        rows.into_iter()
            .filter(|row| row.owner_id == owner_id)
            .filter_map(|row| Some((row.id, row.name.filter(|n| !n.is_empty())?)))
            .collect(),
    )
}
