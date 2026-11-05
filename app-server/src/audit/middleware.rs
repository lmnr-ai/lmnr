//! Audits the public `/v1` API (project API keys) and the `/v1/cli` surface
//! (CLI user tokens). Each route is classified by its matched pattern; routes
//! that already emit their own, richer event (`/v1/sql`, `/v1/mcp`) and
//! ingestion or per-item traffic are skipped.

use std::sync::Arc;

use actix_web::{
    Error, HttpMessage, HttpRequest,
    body::MessageBody,
    dev::{ServiceRequest, ServiceResponse},
    http::Method,
    middleware::Next,
    web,
};
use serde_json::Value;
use uuid::Uuid;

use super::{
    AuditAction, AuditActor, AuditEventInput, AuditOutcome, AuditResource, AuditSource,
    target::Targets,
};
use crate::{
    auth::cli_user::CliProjectAuth, cache::Cache, db::DB, db::project_api_keys::ProjectApiKey,
    mq::MessageQueue,
};

#[derive(Debug, PartialEq, Eq)]
pub(super) enum Classification {
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
pub(super) fn classify(method: &Method, path: &str) -> Option<Classification> {
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
pub(super) fn route(req: &HttpRequest) -> Option<(String, AuditSource)> {
    let pattern = req.match_pattern()?;
    if let Some(rest) = pattern.strip_prefix("/v1/cli") {
        return Some((rest.to_string(), AuditSource::Cli));
    }
    let rest = pattern.strip_prefix("/v1")?;
    Some((rest.to_string(), AuditSource::Api))
}

pub(super) fn actor(req: &HttpRequest) -> Option<(AuditActor, Uuid)> {
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

/// Ids and names past this are dropped; bulk datapoint creates can carry thousands.
const MAX_TARGETS: usize = 100;

#[derive(Debug, PartialEq)]
struct TargetFields {
    resource_id: Option<String>,
    resource_label: Option<String>,
    metadata: Option<Value>,
}

/// One target names the event; several go to `metadata.ids` / `metadata.names`. Path ids
/// that are not targets (`/dashboards/{dashboard_id}/charts`) are kept as parents.
fn target_fields<'a>(
    targets: Targets,
    path_params: impl IntoIterator<Item = (&'a str, &'a str)>,
) -> TargetFields {
    let Targets {
        items,
        mut metadata,
    } = targets;
    for (name, value) in path_params {
        if name.ends_with("_id")
            && name != "project_id"
            && !items
                .iter()
                .any(|target| target.id.eq_ignore_ascii_case(value))
        {
            metadata.insert(name.to_string(), Value::String(value.to_string()));
        }
    }
    let (resource_id, resource_label) = match items.as_slice() {
        [] => (None, None),
        [target] => (Some(target.id.clone()), target.name.clone()),
        many => {
            let capped = &many[..many.len().min(MAX_TARGETS)];
            let ids = capped.iter().map(|t| Value::String(t.id.clone()));
            let names = capped
                .iter()
                .filter_map(|t| t.name.clone())
                .map(Value::String);
            metadata.insert("ids".to_string(), ids.collect());
            metadata.insert("names".to_string(), names.collect());
            metadata.insert("count".to_string(), Value::from(many.len()));
            (None, None)
        }
    };
    TargetFields {
        resource_id,
        resource_label,
        metadata: (!metadata.is_empty()).then_some(Value::Object(metadata)),
    }
}

pub async fn audit_v1(
    req: ServiceRequest,
    next: Next<impl MessageBody>,
) -> Result<ServiceResponse<impl MessageBody>, Error> {
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
    let targets = request.extensions_mut().remove::<Targets>();
    // Runs are exempt: an agent chat has no id to name.
    let writes = matches!(
        action,
        AuditAction::Create | AuditAction::Update | AuditAction::Delete
    );
    if targets.is_none() && writes && res.status().is_success() {
        log::warn!(
            "{} {path} recorded no audit target; call audit::target in its handler",
            request.method()
        );
    }
    let fields = target_fields(targets.unwrap_or_default(), request.match_info().iter());
    input.resource_id = fields.resource_id;
    input.resource_label = fields.resource_label;
    input.metadata = fields.metadata;
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
    use serde_json::json;

    use super::*;
    use crate::audit::target::Target;

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

    fn targets(items: &[(&str, Option<&str>)]) -> Targets {
        Targets {
            items: items
                .iter()
                .map(|(id, name)| Target {
                    id: id.to_string(),
                    name: name.map(str::to_string),
                })
                .collect(),
            ..Targets::default()
        }
    }

    #[test]
    fn one_target_names_the_event() {
        let fields = target_fields(
            targets(&[("d1", Some("Prod"))]),
            [("project_id", "p1"), ("dataset_id", "d1")],
        );
        assert_eq!(
            fields,
            TargetFields {
                resource_id: Some("d1".to_string()),
                resource_label: Some("Prod".to_string()),
                metadata: None,
            }
        );
    }

    #[test]
    fn several_targets_go_to_metadata_with_their_parent() {
        let fields = target_fields(
            targets(&[("c1", Some("Latency")), ("c2", None)]),
            [("dashboard_id", "dash")],
        );
        assert_eq!(fields.resource_id, None);
        assert_eq!(fields.resource_label, None);
        assert_eq!(
            fields.metadata,
            Some(json!({
                "dashboard_id": "dash",
                "ids": ["c1", "c2"],
                "names": ["Latency"],
                "count": 2,
            }))
        );
    }

    #[test]
    fn stored_targets_are_capped() {
        let ids: Vec<String> = (0..150).map(|i| format!("dp{i}")).collect();
        let items: Vec<(&str, Option<&str>)> = ids.iter().map(|id| (id.as_str(), None)).collect();
        let mut many = targets(&items);
        many.metadata.insert("dataset_id".to_string(), json!("ds"));
        let metadata = target_fields(many, []).metadata.unwrap();
        assert_eq!(metadata["ids"].as_array().unwrap().len(), MAX_TARGETS);
        assert_eq!(metadata["count"], json!(150));
        assert_eq!(metadata["dataset_id"], json!("ds"));
    }

    #[test]
    fn untargeted_path_ids_are_parents() {
        let fields = target_fields(Targets::default(), [("dataset_id", "d1"), ("idx", "0")]);
        assert_eq!(fields.resource_id, None);
        assert_eq!(fields.metadata, Some(json!({ "dataset_id": "d1" })));
    }
}
