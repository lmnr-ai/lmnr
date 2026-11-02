//! Dashboard and chart writes for the CLI and the Laminar agent. Everything about them (chart
//! query checks, layout placement, the last-dashboard rule) lives in the frontend's
//! `lib/actions/dashboard`, shared with the UI; this module forwards through `next_api`.

use actix_web::{HttpResponse, ResponseError};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::access_policy::Actor;
use crate::next_api::{self, NextApiError};

#[derive(Debug, thiserror::Error)]
pub enum DashboardError {
    /// From the frontend; a 4xx (400 on a bad chart, 404, 409 on the last dashboard) passes through.
    #[error(transparent)]
    Next(#[from] NextApiError),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

pub fn error_response(e: DashboardError) -> HttpResponse {
    match e {
        DashboardError::Next(e) => e.error_response(),
        DashboardError::Internal(err) => {
            log::error!("Dashboard write failed: {err:?}");
            HttpResponse::InternalServerError().json(json!({ "error": "Internal server error" }))
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    /// Postgres text form, as the frontend returns it.
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardChart {
    pub id: Uuid,
    pub project_id: Uuid,
    pub dashboard_id: Uuid,
    pub name: String,
    pub query: String,
    /// `{config, layout, queryStructure}`; the frontend's `DashboardChart["settings"]`.
    pub settings: Value,
    /// Postgres text form, as the frontend returns it.
    pub created_at: String,
}

/// The written charts in input order, plus caveats that did not block the write (e.g. a query
/// with no rows over the last 24h to check the axes against).
#[derive(Debug, Deserialize)]
pub struct UpsertedCharts {
    pub charts: Vec<DashboardChart>,
    pub warnings: Vec<String>,
}

#[derive(Deserialize)]
struct DeletedCharts {
    deleted: u64,
}

fn dashboard_path(dashboard_id: Uuid) -> String {
    format!("dashboards/{dashboard_id}")
}

pub async fn create_dashboard(
    http_client: &reqwest::Client,
    project_id: Uuid,
    name: &str,
) -> Result<Dashboard, DashboardError> {
    let body = json!({ "name": name });
    Ok(next_api::call(
        http_client,
        Method::POST,
        project_id,
        "dashboards",
        Some(body),
    )
    .await?)
}

pub async fn rename_dashboard(
    http_client: &reqwest::Client,
    project_id: Uuid,
    dashboard_id: Uuid,
    name: &str,
) -> Result<Dashboard, DashboardError> {
    let path = dashboard_path(dashboard_id);
    let body = json!({ "name": name });
    Ok(next_api::call(http_client, Method::PATCH, project_id, &path, Some(body)).await?)
}

/// Charts go with it. Fails with 409 on the project's last dashboard.
pub async fn delete_dashboard(
    http_client: &reqwest::Client,
    project_id: Uuid,
    dashboard_id: Uuid,
) -> Result<(), DashboardError> {
    let path = dashboard_path(dashboard_id);
    let _: Value = next_api::call(http_client, Method::DELETE, project_id, &path, None).await?;
    Ok(())
}

/// Checks and test-runs each chart's query as `actor`, then writes every entry in one
/// transaction. `charts` are the frontend's `ChartInputSchema` entries, forwarded unparsed.
pub async fn upsert_charts(
    http_client: &reqwest::Client,
    project_id: Uuid,
    dashboard_id: Uuid,
    charts: Value,
    actor: Actor,
) -> Result<UpsertedCharts, DashboardError> {
    let path = format!("{}/charts", dashboard_path(dashboard_id));
    let body = json!({ "charts": charts, "actor": actor });
    Ok(next_api::call(http_client, Method::PUT, project_id, &path, Some(body)).await?)
}

/// Returns how many of `chart_ids` were on the dashboard.
pub async fn delete_charts(
    http_client: &reqwest::Client,
    project_id: Uuid,
    dashboard_id: Uuid,
    chart_ids: &[Uuid],
) -> Result<u64, DashboardError> {
    let path = format!("{}/charts", dashboard_path(dashboard_id));
    let body = json!({ "chartIds": chart_ids });
    let deleted: DeletedCharts =
        next_api::call(http_client, Method::DELETE, project_id, &path, Some(body)).await?;
    Ok(deleted.deleted)
}
