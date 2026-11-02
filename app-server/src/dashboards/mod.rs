//! Dashboard and chart writes for the CLI and the Laminar agent. The writes themselves (layout
//! placement, the last-dashboard rule) live in the frontend's `lib/actions/dashboard`, shared with
//! the UI; this module checks charts (`chart_query`) and forwards through `next_api`.

use actix_web::HttpResponse;
use actix_web::http::StatusCode;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::next_api::{self, NextApiError};

pub mod chart_query;

#[derive(Debug, thiserror::Error)]
pub enum DashboardError {
    #[error("{0}")]
    Validation(String),
    /// A rejection from the frontend, e.g. 404, or 409 on the project's last dashboard.
    #[error("{message}")]
    Rejected { status: u16, message: String },
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl From<NextApiError> for DashboardError {
    fn from(e: NextApiError) -> Self {
        match e {
            NextApiError::Status { status, message } if status < 500 => {
                Self::Rejected { status, message }
            }
            e => Self::Internal(anyhow::anyhow!(e)),
        }
    }
}

pub fn error_response(e: DashboardError) -> HttpResponse {
    match e {
        DashboardError::Validation(m) => HttpResponse::BadRequest().json(json!({ "error": m })),
        DashboardError::Rejected { status, message } => {
            HttpResponse::build(StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_REQUEST))
                .json(json!({ "error": message }))
        }
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

/// A chart's cell on the 12-column grid; the frontend validates and places it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Layout {
    pub x: i64,
    pub y: i64,
    pub w: i64,
    pub h: i64,
}

/// One entry of a chart upsert (frontend `ChartUpsertSchema`). With `id` it patches that chart,
/// keeping omitted fields; without `id` it creates one. A query sent without a `queryStructure`
/// makes the chart SQL-only.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChartUpsert {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<Layout>,
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

/// Writes every entry in one transaction and returns the charts in input order. Explicit layouts
/// are applied exactly; charts they overlap are pushed down, and new charts without one are
/// auto-placed.
pub async fn upsert_charts(
    http_client: &reqwest::Client,
    project_id: Uuid,
    dashboard_id: Uuid,
    charts: Vec<ChartUpsert>,
) -> Result<Vec<DashboardChart>, DashboardError> {
    let path = format!("{}/charts", dashboard_path(dashboard_id));
    let body = json!({ "charts": charts });
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
