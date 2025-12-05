use std::{collections::HashMap, sync::Arc};

use actix_web::{HttpResponse, post, web};
use opentelemetry::{
    global,
    trace::{Tracer, mark_span_as_active},
};
use serde::{Deserialize, Serialize};

use crate::{
    db::{
        DB,
        project_api_keys::ProjectApiKey,
        projects::{DeploymentMode, get_workspace_by_project_id},
    },
    query_engine::QueryEngine,
    sql::{self, ClickhouseReadonlyClient},
};

use crate::routes::types::ResponseResult;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryRequest {
    pub query: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlQueryResponse {
    pub data: Vec<serde_json::Value>,
}

#[post("sql/query")]
pub async fn execute_sql_query(
    req: web::Json<SqlQueryRequest>,
    project_api_key: ProjectApiKey,
    db: web::Data<DB>,
    clickhouse_ro: web::Data<Option<Arc<ClickhouseReadonlyClient>>>,
    query_engine: web::Data<Arc<QueryEngine>>,
    http_client: web::Data<Arc<reqwest::Client>>,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let SqlQueryRequest { query } = req.into_inner();

    let tracer = global::tracer("tracer");
    let span = tracer.start("api_sql_query");
    let _guard = mark_span_as_active(span);

    // Fetch workspace info for routing
    let workspace = get_workspace_by_project_id(&db.pool, &project_id)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to get workspace: {}", e))?;

    match workspace.deployment_mode {
        DeploymentMode::CLOUD | DeploymentMode::SELF_HOST => match clickhouse_ro.as_ref() {
            Some(ro_client) => {
                match sql::execute_sql_query(
                    query,
                    project_id,
                    HashMap::new(),
                    ro_client.clone(),
                    query_engine.into_inner().as_ref().clone(),
                )
                .await
                {
                    Ok(result_json) => {
                        Ok(HttpResponse::Ok().json(SqlQueryResponse { data: result_json }))
                    }
                    Err(e) => Err(e.into()),
                }
            }
            None => Err(anyhow::anyhow!("ClickHouse read-only client is not configured.").into()),
        },
        DeploymentMode::HYBRID => {
            match sql::execute_sql_query_on_data_plane(
                query,
                project_id,
                workspace.id,
                workspace
                    .data_plane_url
                    .ok_or_else(|| anyhow::anyhow!("Data plane URL is not set"))?,
                http_client.into_inner().as_ref().clone(),
                query_engine.into_inner().as_ref().clone(),
            )
            .await
            {
                Ok(result_json) => {
                    Ok(HttpResponse::Ok().json(SqlQueryResponse { data: result_json }))
                }
                Err(e) => Err(e.into()),
            }
        }
    }
}
