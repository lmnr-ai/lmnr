//! CLI dashboard and chart writes. Auth via `CliProjectAuth`; writes go through `crate::dashboards`
//! to the frontend, which the UI writes through too. Charts are raw SQL, checked and test-run by
//! `dashboards::chart_query` before anything is saved. Reads go through `lmnr-cli sql query`
//! (`dashboards` / `dashboard_charts`).

use std::sync::Arc;

use actix_web::{HttpResponse, delete, patch, post, put, web};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::access_policy::{self, Actor};
use crate::auth::cli_user::CliProjectAuth;
use crate::cache::Cache;
use crate::dashboards::{
    self, Dashboard, DashboardError,
    chart_query::{self, ChartInput, QueryRunner},
};
use crate::db::DB;
use crate::query_engine::QueryEngine;
use crate::routes::types::ResponseResult;
use crate::sql::ClickhouseReadonlyClient;
use crate::utils::frontend_url_with_default;

#[derive(Deserialize)]
pub struct DashboardNameInput {
    name: String,
}

#[derive(Deserialize)]
pub struct UpsertChartsInput {
    charts: Vec<ChartInput>,
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

fn dashboard_response(dashboard: Dashboard) -> HttpResponse {
    let dashboard_url = dashboard_url(dashboard.project_id, dashboard.id);
    HttpResponse::Ok().json(DashboardResponse {
        dashboard,
        dashboard_url,
    })
}

#[post("dashboards")]
pub async fn create_dashboard(
    auth: CliProjectAuth,
    body: web::Json<DashboardNameInput>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let result = dashboards::create_dashboard(&http_client, auth.project_id, &body.name).await;
    Ok(match result {
        Ok(dashboard) => dashboard_response(dashboard),
        Err(e) => dashboards::error_response(e),
    })
}

#[patch("dashboards/{dashboard_id}")]
pub async fn rename_dashboard(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Json<DashboardNameInput>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let result =
        dashboards::rename_dashboard(&http_client, auth.project_id, path.into_inner(), &body.name)
            .await;
    Ok(match result {
        Ok(dashboard) => dashboard_response(dashboard),
        Err(e) => dashboards::error_response(e),
    })
}

#[delete("dashboards/{dashboard_id}")]
pub async fn delete_dashboard(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let dashboard_id = path.into_inner();
    let result = dashboards::delete_dashboard(&http_client, auth.project_id, dashboard_id).await;
    Ok(match result {
        Ok(()) => HttpResponse::Ok().json(json!({ "id": dashboard_id, "deleted": true })),
        Err(e) => dashboards::error_response(e),
    })
}

/// Creates or updates several charts in one all-or-nothing call; see `dashboards::upsert_charts`
/// for layout semantics.
#[put("dashboards/{dashboard_id}/charts")]
pub async fn upsert_charts(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Json<UpsertChartsInput>,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    http_client: web::Data<reqwest::Client>,
    cache: web::Data<Cache>,
) -> ResponseResult {
    let dashboard_id = path.into_inner();
    let Some(clickhouse_ro) = clickhouse_ro.as_ref().clone() else {
        return Err(anyhow::anyhow!("ClickHouse read-only client is not configured.").into());
    };
    let db = db.into_inner();
    let cache = cache.into_inner();
    let policy =
        access_policy::for_actor_or_masked(&Actor::Cli, auth.project_id, db.clone(), cache.clone())
            .await;
    let runner = QueryRunner {
        project_id: auth.project_id,
        policy,
        clickhouse_ro,
        query_engine: query_engine.into_inner().as_ref().clone(),
        http_client: http_client.clone().into_inner(),
        db: db.clone(),
        cache,
    };

    let result = async {
        let checked = chart_query::check_charts(body.into_inner().charts, &runner).await?;
        let charts =
            dashboards::upsert_charts(&http_client, auth.project_id, dashboard_id, checked.upserts)
                .await?;
        Ok::<_, DashboardError>((charts, checked.warnings))
    }
    .await;

    Ok(match result {
        Ok((charts, warnings)) => HttpResponse::Ok().json(UpsertChartsResponse {
            charts: charts
                .into_iter()
                .map(|chart| ChartSummary {
                    id: chart.id,
                    name: chart.name,
                    config: chart.settings.get("config").cloned(),
                    layout: chart.settings.get("layout").cloned(),
                })
                .collect(),
            warnings,
            dashboard_url: dashboard_url(auth.project_id, dashboard_id),
        }),
        Err(e) => dashboards::error_response(e),
    })
}

/// Deletes charts in one call; remaining charts keep their positions. Ids not on the dashboard
/// are skipped, so `deleted` may be less than `requested`.
#[delete("dashboards/{dashboard_id}/charts")]
pub async fn delete_charts(
    auth: CliProjectAuth,
    path: web::Path<Uuid>,
    body: web::Json<DeleteChartsInput>,
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let chart_ids = body.into_inner().chart_ids;
    let result =
        dashboards::delete_charts(&http_client, auth.project_id, path.into_inner(), &chart_ids)
            .await;
    Ok(match result {
        Ok(deleted) => {
            HttpResponse::Ok().json(json!({ "deleted": deleted, "requested": chart_ids.len() }))
        }
        Err(e) => dashboards::error_response(e),
    })
}
