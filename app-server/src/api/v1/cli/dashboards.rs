//! CLI dashboard and chart writes. Auth via `CliProjectAuth`; writes go through `crate::dashboards`
//! to the frontend, which the UI writes through too. Charts are raw SQL, checked and test-run there
//! (`lib/actions/dashboard/chart-query.ts`) before anything is saved. Reads go through
//! `lmnr-cli sql query` (`dashboards` / `dashboard_charts`).

use std::sync::Arc;

use actix_web::{HttpRequest, HttpResponse, delete, patch, post, put, web};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::access_policy::{self, Actor};
use crate::audit::{self, AuditActor, AuditOutcome};
use crate::auth::cli_user::CliProjectAuth;
use crate::cache::Cache;
use crate::dashboards::{self, Dashboard};
use crate::db::DB;
use crate::mq::MessageQueue;
use crate::query_engine::{QueryEngine, QueryEngineValidationResult};
use crate::routes::types::ResponseResult;
use crate::sql::{self, SqlAudit, SqlQuerySource};
use crate::utils::frontend_url_with_default;

#[derive(Deserialize)]
pub struct DashboardNameInput {
    name: String,
}

#[derive(Deserialize)]
pub struct UpsertChartsInput {
    charts: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteChartsInput {
    chart_ids: Vec<Uuid>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DashboardResponse {
    #[serde(flatten)]
    dashboard: Dashboard,
    dashboard_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChartSummary {
    id: Uuid,
    name: String,
    config: Option<Value>,
    layout: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpsertChartsResponse {
    charts: Vec<ChartSummary>,
    warnings: Vec<String>,
    dashboard_url: String,
}

fn dashboard_url(project_id: Uuid, dashboard_id: Uuid) -> String {
    format!(
        "{}/project/{project_id}/dashboards/{dashboard_id}",
        frontend_url_with_default("https://laminar.sh")
    )
}

fn dashboard_response(req: &HttpRequest, dashboard: Dashboard) -> HttpResponse {
    audit::target_named(req, dashboard.id, dashboard.name.clone());
    let dashboard_url = dashboard_url(dashboard.project_id, dashboard.id);
    HttpResponse::Ok().json(DashboardResponse {
        dashboard,
        dashboard_url,
    })
}

#[post("dashboards")]
pub async fn create_dashboard(
    req: HttpRequest,
    auth: CliProjectAuth,
    body: web::Json<DashboardNameInput>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let result = dashboards::create_dashboard(&http_client, auth.project_id, &body.name).await;
    Ok(match result {
        Ok(dashboard) => dashboard_response(&req, dashboard),
        Err(e) => dashboards::error_response(e),
    })
}

#[patch("dashboards/{dashboard_id}")]
pub async fn rename_dashboard(
    req: HttpRequest,
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Json<DashboardNameInput>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let result =
        dashboards::rename_dashboard(&http_client, auth.project_id, path.into_inner(), &body.name)
            .await;
    Ok(match result {
        Ok(dashboard) => dashboard_response(&req, dashboard),
        Err(e) => dashboards::error_response(e),
    })
}

#[delete("dashboards/{dashboard_id}")]
pub async fn delete_dashboard(
    req: HttpRequest,
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let dashboard_id = path.into_inner();
    audit::target(&req, [dashboard_id]).await;
    let result = dashboards::delete_dashboard(&http_client, auth.project_id, dashboard_id).await;
    Ok(match result {
        Ok(()) => HttpResponse::Ok().json(json!({ "id": dashboard_id, "deleted": true })),
        Err(e) => dashboards::error_response(e),
    })
}

fn chart_queries(charts: &Value) -> Vec<String> {
    charts
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|chart| chart.get("query")?.as_str().map(str::to_string))
        .collect()
}

/// The frontend test-runs each chart query as `Actor::Cli`, which names no user, so the
/// `sql.query` events are emitted here, where the CLI user is known. A batch that failed
/// (any query rejected or erroring) marks its valid queries `error`.
async fn audit_chart_queries(
    auth: &CliProjectAuth,
    queries: Vec<String>,
    saved: bool,
    db: Arc<DB>,
    cache: Arc<Cache>,
    queue: Arc<MessageQueue>,
    query_engine: Arc<QueryEngine>,
) {
    if queries.is_empty() {
        return;
    }
    let policy =
        access_policy::for_actor_or_masked(&Actor::Cli, auth.project_id, db.clone(), cache.clone())
            .await;
    for query in queries {
        let (tables, outcome) = match query_engine
            .validate_query(query.clone(), auth.project_id, &policy)
            .await
        {
            Ok(QueryEngineValidationResult::Success { tables, .. }) => {
                let outcome = if saved {
                    AuditOutcome::Success
                } else {
                    AuditOutcome::Error
                };
                (tables, outcome)
            }
            Ok(QueryEngineValidationResult::Error { .. }) => (Vec::new(), AuditOutcome::Denied),
            Err(_) => (Vec::new(), AuditOutcome::Error),
        };
        let audit = SqlAudit {
            actor: AuditActor::User {
                user_id: auth.user_id,
            },
            queue: queue.clone(),
        };
        sql::audit_sql_query(
            db.clone(),
            cache.clone(),
            audit,
            auth.project_id,
            SqlQuerySource::Cli,
            query,
            tables,
            outcome,
        )
        .await;
    }
}

/// Creates or updates several charts in one all-or-nothing call; see `dashboards::upsert_charts`
/// for layout semantics.
#[put("dashboards/{dashboard_id}/charts")]
pub async fn upsert_charts(
    req: HttpRequest,
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Json<UpsertChartsInput>,
    http_client: web::Data<reqwest::Client>,
    db: web::Data<DB>,
    cache: web::Data<Cache>,
    queue: web::Data<Arc<MessageQueue>>,
    query_engine: web::Data<Arc<QueryEngine>>,
) -> ResponseResult {
    let dashboard_id = path.into_inner();
    let charts = body.into_inner().charts;
    let queries = chart_queries(&charts);
    let result = dashboards::upsert_charts(
        &http_client,
        auth.project_id,
        dashboard_id,
        charts,
        Actor::Cli,
    )
    .await;
    audit_chart_queries(
        &auth,
        queries,
        result.is_ok(),
        db.into_inner(),
        cache.into_inner(),
        queue.get_ref().clone(),
        query_engine.get_ref().clone(),
    )
    .await;

    audit::target_parent(&req, "dashboard_id", dashboard_id);
    Ok(match result {
        Ok(upserted) => HttpResponse::Ok().json(UpsertChartsResponse {
            charts: upserted
                .charts
                .into_iter()
                .map(|chart| {
                    audit::target_named(&req, chart.id, chart.name.clone());
                    ChartSummary {
                        id: chart.id,
                        name: chart.name,
                        config: chart.settings.get("config").cloned(),
                        layout: chart.settings.get("layout").cloned(),
                    }
                })
                .collect(),
            warnings: upserted.warnings,
            dashboard_url: dashboard_url(auth.project_id, dashboard_id),
        }),
        Err(e) => dashboards::error_response(e),
    })
}

/// Deletes charts in one call; remaining charts keep their positions. Ids not on the dashboard
/// are skipped, so `deleted` may be less than `requested`.
#[delete("dashboards/{dashboard_id}/charts")]
pub async fn delete_charts(
    req: HttpRequest,
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Json<DeleteChartsInput>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let dashboard_id = path.into_inner();
    let chart_ids = body.into_inner().chart_ids;
    audit::target(&req, &chart_ids).await;
    audit::target_parent(&req, "dashboard_id", dashboard_id);
    let result =
        dashboards::delete_charts(&http_client, auth.project_id, dashboard_id, &chart_ids).await;
    Ok(match result {
        Ok(deleted) => {
            HttpResponse::Ok().json(json!({ "deleted": deleted, "requested": chart_ids.len() }))
        }
        Err(e) => dashboards::error_response(e),
    })
}
