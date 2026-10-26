//! Dashboard and chart writes for the frontend (server-to-server; project access is checked in
//! Next.js). Reads, layout drags and chart duplication stay in the frontend.

use actix_web::{HttpResponse, delete, patch, post, put, web};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::dashboards::{self, ChartUpsert};
use crate::db::DB;
use crate::routes::ResponseResult;

#[derive(Deserialize)]
pub struct DashboardNameInput {
    name: String,
}

#[derive(Deserialize)]
pub struct UpsertChartsInput {
    charts: Vec<ChartUpsert>,
}

#[post("dashboards")]
pub async fn create_dashboard(
    project_id: web::Path<Uuid>,
    body: web::Json<DashboardNameInput>,
    db: web::Data<DB>,
) -> ResponseResult {
    let result = dashboards::create_dashboard(&db.pool, project_id.into_inner(), &body.name).await;
    Ok(match result {
        Ok(dashboard) => HttpResponse::Ok().json(dashboard),
        Err(e) => dashboards::error_response(e),
    })
}

#[patch("dashboards/{dashboard_id}")]
pub async fn rename_dashboard(
    path: web::Path<(Uuid, Uuid)>,
    body: web::Json<DashboardNameInput>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (project_id, dashboard_id) = path.into_inner();
    let result = dashboards::rename_dashboard(&db.pool, project_id, dashboard_id, &body.name).await;
    Ok(match result {
        Ok(dashboard) => HttpResponse::Ok().json(dashboard),
        Err(e) => dashboards::error_response(e),
    })
}

#[delete("dashboards/{dashboard_id}")]
pub async fn delete_dashboard(path: web::Path<(Uuid, Uuid)>, db: web::Data<DB>) -> ResponseResult {
    let (project_id, dashboard_id) = path.into_inner();
    let result = dashboards::delete_dashboard(&db.pool, project_id, dashboard_id).await;
    Ok(match result {
        Ok(()) => HttpResponse::Ok().json(json!({ "success": true })),
        Err(e) => dashboards::error_response(e),
    })
}

#[put("dashboards/{dashboard_id}/charts")]
pub async fn upsert_charts(
    path: web::Path<(Uuid, Uuid)>,
    body: web::Json<UpsertChartsInput>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (project_id, dashboard_id) = path.into_inner();
    let charts = body.into_inner().charts;
    let result = dashboards::upsert_charts(&db.pool, project_id, dashboard_id, charts).await;
    Ok(match result {
        Ok(charts) => HttpResponse::Ok().json(charts),
        Err(e) => dashboards::error_response(e),
    })
}

#[delete("dashboards/{dashboard_id}/charts/{chart_id}")]
pub async fn delete_chart(
    path: web::Path<(Uuid, Uuid, Uuid)>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (project_id, dashboard_id, chart_id) = path.into_inner();
    let result = dashboards::delete_charts(&db.pool, project_id, dashboard_id, &[chart_id]).await;
    Ok(match result {
        Ok(0) => {
            dashboards::error_response(dashboards::DashboardError::NotFound("Chart".to_string()))
        }
        Ok(_) => HttpResponse::Ok().json(json!({ "success": true })),
        Err(e) => dashboards::error_response(e),
    })
}
