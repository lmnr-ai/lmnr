//! CLI dashboard and chart writes. Auth via `CliProjectAuth`; writes go through `crate::dashboards`
//! to the frontend, which the UI writes through too. Charts are raw SQL, checked and test-run there
//! (`lib/actions/dashboard/chart-query.ts`) before anything is saved. Reads go through
//! `lmnr-cli sql query` (`dashboards` / `dashboard_charts`).

use actix_web::{HttpResponse, delete, patch, post, put, web};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::access_policy::Actor;
use crate::auth::cli_user::CliProjectAuth;
use crate::dashboards::{self, Dashboard};
use crate::routes::types::ResponseResult;
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
    http_client: web::Data<reqwest::Client>,
) -> ResponseResult {
    let dashboard_id = path.into_inner();
    let result = dashboards::upsert_charts(
        &http_client,
        auth.project_id,
        dashboard_id,
        body.into_inner().charts,
        Actor::Cli,
    )
    .await;

    Ok(match result {
        Ok(upserted) => HttpResponse::Ok().json(UpsertChartsResponse {
            charts: upserted
                .charts
                .into_iter()
                .map(|chart| ChartSummary {
                    id: chart.id,
                    name: chart.name,
                    config: chart.settings.get("config").cloned(),
                    layout: chart.settings.get("layout").cloned(),
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
