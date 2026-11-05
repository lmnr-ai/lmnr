//! Audits the public `/v1` API (project API keys) and the `/v1/cli` surface
//! (CLI user tokens). Each route is classified by its matched pattern; routes
//! that already emit their own, richer event (`/v1/sql`, `/v1/mcp`) and
//! ingestion or per-item traffic are skipped.

use std::sync::Arc;

use actix_web::{
    Error, HttpMessage, HttpRequest,
    body::MessageBody,
    dev::{Path, ResourceDef, ServiceRequest, ServiceResponse},
    http::Method,
    middleware::Next,
    web,
};
use uuid::Uuid;

use super::{AuditAction, AuditActor, AuditEventInput, AuditOutcome, AuditResource, AuditSource};
use crate::{
    auth::cli_user::CliProjectAuth, cache::Cache, db::DB, db::project_api_keys::ProjectApiKey,
    mq::MessageQueue,
};

#[derive(Debug, PartialEq, Eq)]
enum Classification {
    Log {
        resource: AuditResource,
        action: AuditAction,
        read: bool,
    },
    Skip,
}

use Classification::Skip;

const fn log(resource: AuditResource, action: AuditAction) -> Classification {
    Classification::Log {
        resource,
        action,
        read: false,
    }
}

/// `path` is the matched pattern with its `/v1` or `/v1/cli` prefix removed.
/// `None` for a route nobody has classified yet.
fn classify(method: &Method, path: &str) -> Option<Classification> {
    use AuditAction::*;
    use AuditResource::*;

    let method = method.as_str();
    let classification = match (method, path) {
        // Ingestion and SDK hot paths.
        ("POST", "/traces/metadata") => log(Trace, Update),
        (
            "POST",
            "/traces" | "/spans" | "/logs" | "/metrics" | "/browser-sessions/events" | "/tag",
        ) => Skip,
        ("POST", "/labeling_queues/{queue_id}/items") => Skip,
        // Emitted by the handlers with the query text / tool details.
        (_, "/sql/query" | "/mcp") => Skip,
        // Discovery and schema reads carry no data.
        ("GET", "/project" | "/projects" | "/sql/schema") | ("POST", "/project") => Skip,

        ("POST", "/datasets") => log(Dataset, Create),
        ("PATCH", "/datasets/{dataset_id}") => log(Dataset, Update),
        ("DELETE", "/datasets/{dataset_id}") => log(Dataset, Delete),
        ("POST", "/datasets/datapoints") => log(Datapoint, Create),
        ("GET", "/datasets/{dataset_id}/parquets/{idx}") => Classification::Log {
            resource: Dataset,
            action: Export,
            read: true,
        },
        // Config reads, and datapoint pages an eval run walks through.
        ("GET", "/datasets" | "/datasets/{dataset_id}" | "/datasets/datapoints") => Skip,

        ("POST", "/llm-profiles") => log(LlmProfile, Create),
        ("PATCH", "/llm-profiles/{profile_id}") => log(LlmProfile, Update),
        ("DELETE", "/llm-profiles/{profile_id}") => log(LlmProfile, Delete),
        ("GET", "/llm-profiles" | "/llm-profiles/{profile_id}") => Skip,

        ("POST", "/signals") => log(Signal, Create),
        ("PATCH", "/signals/{signal_id}") => log(Signal, Update),
        ("DELETE", "/signals/{signal_id}") => log(Signal, Delete),
        ("GET", "/signals" | "/signals/{signal_id}" | "/signals/{signal_id}/versions") => Skip,

        ("POST", "/alerts") => log(Alert, Create),
        ("PATCH", "/alerts/{alert_id}") => log(Alert, Update),
        ("DELETE", "/alerts/{alert_id}") => log(Alert, Delete),

        ("POST", "/dashboards") => log(Dashboard, Create),
        ("PATCH", "/dashboards/{dashboard_id}") => log(Dashboard, Update),
        ("DELETE", "/dashboards/{dashboard_id}") => log(Dashboard, Delete),
        ("PUT", "/dashboards/{dashboard_id}/charts") => log(Chart, Update),
        ("DELETE", "/dashboards/{dashboard_id}/charts") => log(Chart, Delete),

        // An eval run is logged once, at its start; trials and status
        // updates are per-item traffic.
        ("POST", "/evals") => log(Evaluation, Create),
        (
            "POST",
            "/evals/{eval_id}"
            | "/evals/{eval_id}/datapoints"
            | "/evals/{eval_id}/datapoints/{trial_id}",
        ) => Skip,
        ("POST", "/hosted-evals/runs") => log(Evaluation, Run),
        (_, p) if p.starts_with("/hosted-evals/") => Skip,

        ("POST", "/rollouts/{session_id}") => log(DebuggerSession, Create),
        ("PATCH", "/rollouts/{session_id}/name") => log(DebuggerSession, Update),
        ("DELETE", "/rollouts/{session_id}") => log(DebuggerSession, Delete),
        (_, "/rollouts/{session_id}/blocks" | "/rollouts/{session_id}/cache") => Skip,

        ("POST", "/agent/chat") => log(Agent, Run),
        ("POST", "/chat/completions") => Skip,

        _ => return None,
    };
    Some(classification)
}

/// Pattern relative to the API root, and which surface it belongs to.
fn route(req: &HttpRequest) -> Option<(String, AuditSource)> {
    let pattern = req.match_pattern()?;
    if let Some(rest) = pattern.strip_prefix("/v1/cli") {
        return Some((rest.to_string(), AuditSource::Cli));
    }
    let rest = pattern.strip_prefix("/v1")?;
    Some((rest.to_string(), AuditSource::Api))
}

fn actor(req: &HttpRequest) -> Option<(AuditActor, uuid::Uuid)> {
    let extensions = req.extensions();
    if let Some(key) = extensions.get::<ProjectApiKey>() {
        return Some((AuditActor::api_key(key), key.project_id));
    }
    extensions.get::<CliProjectAuth>().map(|auth| {
        (
            AuditActor::User {
                user_id: auth.user_id,
            },
            auth.project_id,
        )
    })
}

/// The innermost id in the path (`/dashboards/{dashboard_id}/charts` →
/// the dashboard).
fn path_resource_id(req: &HttpRequest) -> Option<String> {
    innermost_id(req.match_info())
}

fn innermost_id(path: &Path<impl actix_web::dev::ResourcePath>) -> Option<String> {
    path.iter()
        .filter(|(name, _)| name.ends_with("_id") && *name != "project_id")
        .last()
        .map(|(_, value)| value.to_string())
}

/// What owns a deleted row, compared with the caller once auth has resolved it.
enum NameScope {
    Project(Uuid),
    Workspace(Uuid),
}

struct DeletedName {
    name: String,
    scope: NameScope,
}

/// The display name and owner of a resource `/v1` deletes, and whether the owner is a
/// workspace (else a project).
fn name_query(resource: AuditResource) -> Option<(&'static str, bool)> {
    use AuditResource::*;
    Some(match resource {
        Dataset => ("SELECT name, project_id FROM datasets WHERE id = $1", false),
        Signal => ("SELECT name, project_id FROM signals WHERE id = $1", false),
        Alert => ("SELECT name, project_id FROM alerts WHERE id = $1", false),
        Dashboard => (
            "SELECT name, project_id FROM dashboards WHERE id = $1",
            false,
        ),
        DebuggerSession => (
            "SELECT name, project_id FROM debugger_sessions WHERE id = $1",
            false,
        ),
        LlmProfile => (
            "SELECT name, workspace_id FROM llm_profiles WHERE id = $1",
            true,
        ),
        _ => return None,
    })
}

/// Read before the handler deletes the row. The caller's project is only known after its
/// auth extractor runs, so the row's owner is kept and checked in `label_for`.
async fn deleted_name(req: &ServiceRequest) -> Option<DeletedName> {
    if req.method() != Method::DELETE {
        return None;
    }
    let request = req.request();
    let (path, _) = route(request)?;
    let Some(Classification::Log {
        resource,
        action: AuditAction::Delete,
        ..
    }) = classify(req.method(), &path)
    else {
        return None;
    };
    let (query, by_workspace) = name_query(resource)?;
    let pattern = request.match_pattern()?;
    let mut captured = Path::new(req.path().to_string());
    if !ResourceDef::new(pattern.as_str()).capture_match_info(&mut captured) {
        return None;
    }
    let id: Uuid = innermost_id(&captured)?.parse().ok()?;
    let db = request.app_data::<web::Data<DB>>()?;
    let (name, owner_id) = sqlx::query_as::<_, (Option<String>, Uuid)>(query)
        .bind(id)
        .fetch_optional(&db.pool)
        .await
        .ok()??;
    let scope = if by_workspace {
        NameScope::Workspace(owner_id)
    } else {
        NameScope::Project(owner_id)
    };
    Some(DeletedName {
        name: name.filter(|n| !n.is_empty())?,
        scope,
    })
}

impl DeletedName {
    async fn label_for(self, project_id: Uuid, db: &DB) -> Option<String> {
        let owned = match self.scope {
            NameScope::Project(owner) => owner == project_id,
            NameScope::Workspace(owner) => {
                sqlx::query_scalar::<_, Uuid>("SELECT workspace_id FROM projects WHERE id = $1")
                    .bind(project_id)
                    .fetch_optional(&db.pool)
                    .await
                    .ok()
                    .flatten()
                    == Some(owner)
            }
        };
        owned.then_some(self.name)
    }
}

pub async fn audit_v1(
    req: ServiceRequest,
    next: Next<impl MessageBody>,
) -> Result<ServiceResponse<impl MessageBody>, Error> {
    let deleted = deleted_name(&req).await;
    let res = next.call(req).await?;

    let request = res.request();
    let Some((path, source)) = route(request) else {
        return Ok(res);
    };
    let (resource, action, read) = match classify(request.method(), &path) {
        Some(Classification::Log {
            resource,
            action,
            read,
        }) => (resource, action, read),
        Some(Skip) => return Ok(res),
        None => {
            log::warn!(
                "Unclassified /v1 route {} {path}; add it to audit::middleware::classify",
                request.method()
            );
            return Ok(res);
        }
    };
    // Requests rejected before auth resolved a project have nobody to
    // attribute the event to.
    let Some((actor, project_id)) = actor(request) else {
        return Ok(res);
    };
    let (Some(db), Some(cache), Some(queue)) = (
        request.app_data::<web::Data<DB>>(),
        request.app_data::<web::Data<Cache>>(),
        request.app_data::<web::Data<Arc<MessageQueue>>>(),
    ) else {
        return Ok(res);
    };

    let mut input = AuditEventInput::new(
        actor,
        source,
        resource,
        action,
        AuditOutcome::from_status(res.status().as_u16()),
    );
    input.project_id = Some(project_id);
    input.resource_id = path_resource_id(request);
    if let Some(deleted) = deleted {
        input.resource_label = deleted.label_for(project_id, db).await;
    }
    input.ip = request
        .connection_info()
        .realip_remote_addr()
        .map(str::to_string);
    input.user_agent = request
        .headers()
        .get(actix_web::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    let (db, cache, queue) = (
        db.clone().into_inner(),
        cache.clone().into_inner(),
        queue.get_ref().clone(),
    );
    if read {
        super::emit_detached(db, cache, queue, input);
    } else if let Err(e) = super::emit(db, cache, &queue, input).await {
        log::error!("Failed to emit /v1 audit event: {e:?}");
    }
    Ok(res)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ingestion_and_per_item_routes_are_skipped() {
        for (method, path) in [
            (Method::POST, "/traces"),
            (Method::POST, "/spans"),
            (Method::POST, "/evals/{eval_id}/datapoints"),
            (Method::POST, "/rollouts/{session_id}/blocks"),
            (Method::PUT, "/hosted-evals/images/layers/{diff_id}"),
            (Method::POST, "/sql/query"),
        ] {
            assert_eq!(classify(&method, path), Some(Skip), "{method} {path}");
        }
    }

    #[test]
    fn writes_and_run_starts_are_logged() {
        assert_eq!(
            classify(&Method::POST, "/traces/metadata"),
            Some(log(AuditResource::Trace, AuditAction::Update))
        );
        assert_eq!(
            classify(&Method::POST, "/evals"),
            Some(log(AuditResource::Evaluation, AuditAction::Create))
        );
        assert_eq!(
            classify(&Method::DELETE, "/datasets/{dataset_id}"),
            Some(log(AuditResource::Dataset, AuditAction::Delete))
        );
        assert_eq!(classify(&Method::POST, "/unknown"), None);
    }
}
