//! Dataset tools: the MCP twins of `lmnr-cli dataset`. Same `datasets::service` calls as the
//! `/v1/datasets` and `/v1/cli/datasets` handlers.

use rmcp::{
    ErrorData as McpError, RoleServer, handler::server::wrapper::Parameters,
    model::CallToolResponse, schemars, service::RequestContext, tool, tool_router,
};
use serde_json::{Value, json};
use uuid::Uuid;

use super::{AuditTarget, LaminarMcpServer, ProjectParam, internal_error, tool_error, tool_json};
use crate::{
    audit::{AuditAction, AuditResource},
    datasets::service::{
        self, CreateDatapointsOutcome, DatasetError, DatasetId, DatasetIdentifier, DatasetName,
        NewDatapoint,
    },
    db,
};

/// Cap on one `get_datapoints` page, matching `/v1/cli/datasets/datapoints`.
const MAX_DATAPOINTS_PAGE: i64 = 1000;

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListDatasetsParams {
    /// Only the dataset with this exact name.
    #[serde(default)]
    pub name: Option<String>,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateDatasetParams {
    pub name: String,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RenameDatasetParams {
    pub dataset_id: Uuid,
    pub name: String,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDatasetParams {
    pub dataset_id: Uuid,
    #[serde(flatten)]
    pub project: ProjectParam,
}

/// A dataset by id or by name; set exactly one.
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DatasetRef {
    #[serde(default)]
    pub dataset_id: Option<Uuid>,
    #[serde(default)]
    pub dataset_name: Option<String>,
}

impl DatasetRef {
    fn identifier(self) -> Result<DatasetIdentifier, CallToolResponse> {
        match (self.dataset_id, self.dataset_name) {
            (Some(dataset_id), None) => Ok(DatasetIdentifier::Id(DatasetId { dataset_id })),
            (None, Some(dataset_name)) => Ok(DatasetIdentifier::Name(DatasetName { dataset_name })),
            _ => Err(tool_error(
                "Pass exactly one of `datasetId` or `datasetName`.",
            )),
        }
    }
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetDatapointsParams {
    #[serde(flatten)]
    pub dataset: DatasetRef,
    /// Page size, 1-1000. Default 100.
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DatapointInput {
    /// The datapoint's input, any JSON.
    pub data: Value,
    /// Expected output, any JSON.
    #[serde(default)]
    pub target: Option<Value>,
    #[serde(default)]
    pub metadata: Option<serde_json::Map<String, Value>>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AddDatapointsParams {
    #[serde(flatten)]
    pub dataset: DatasetRef,
    pub datapoints: Vec<DatapointInput>,
    /// Create the dataset (by `datasetName`) when it does not exist.
    #[serde(default)]
    pub create_dataset: bool,
    #[serde(flatten)]
    pub project: ProjectParam,
}

fn dataset_error(tool: &str, error: DatasetError) -> CallToolResponse {
    match error {
        DatasetError::Internal(e) => internal_error(tool, e),
        e => tool_error(e.to_string()),
    }
}

#[tool_router(router = dataset_tools, vis = "pub(super)")]
impl LaminarMcpServer {
    /// List the project's datasets (id, name, createdAt).
    #[tool(name = "list_datasets")]
    async fn list_datasets(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<ListDatasetsParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        match db::datasets::get_datasets(&self.db.pool, scope.project_id, None, params.name).await {
            Ok(datasets) => Ok(tool_json(&json!({ "datasets": datasets }))),
            Err(e) => Ok(internal_error("list_datasets", e)),
        }
    }

    /// Create an empty dataset. Use `add_datapoints` to fill it.
    #[tool(name = "create_dataset")]
    async fn create_dataset(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<CreateDatasetParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let result = service::create_dataset(&self.db.pool, scope.project_id, params.name).await;
        let target = result
            .as_ref()
            .map(|dataset| AuditTarget::named(dataset.id, &dataset.name))
            .unwrap_or_default();
        self.audit(
            &scope,
            AuditResource::Dataset,
            AuditAction::Create,
            result.is_ok(),
            target,
            None,
        )
        .await;
        Ok(match result {
            Ok(dataset) => tool_json(&dataset),
            Err(e) => dataset_error("create_dataset", e),
        })
    }

    /// Rename a dataset.
    #[tool(name = "rename_dataset")]
    async fn rename_dataset(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<RenameDatasetParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let result = service::update_dataset(
            &self.db.pool,
            scope.project_id,
            params.dataset_id,
            params.name,
        )
        .await;
        let target = result
            .as_ref()
            .map(|dataset| AuditTarget::named(dataset.id, &dataset.name))
            .unwrap_or(AuditTarget::id(params.dataset_id));
        self.audit(
            &scope,
            AuditResource::Dataset,
            AuditAction::Update,
            result.is_ok(),
            target,
            None,
        )
        .await;
        Ok(match result {
            Ok(dataset) => tool_json(&dataset),
            Err(e) => dataset_error("rename_dataset", e),
        })
    }

    /// Delete a dataset and all of its datapoints. Irreversible.
    #[tool(name = "delete_dataset")]
    async fn delete_dataset(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<DeleteDatasetParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let result = service::delete_dataset(
            &self.db.pool,
            &self.clickhouse,
            scope.project_id,
            params.dataset_id,
        )
        .await;
        let target = result
            .as_ref()
            .map(|dataset| AuditTarget::named(dataset.id, &dataset.name))
            .unwrap_or(AuditTarget::id(params.dataset_id));
        self.audit(
            &scope,
            AuditResource::Dataset,
            AuditAction::Delete,
            result.is_ok(),
            target,
            None,
        )
        .await;
        Ok(match result {
            Ok(dataset) => tool_json(&dataset),
            Err(e) => dataset_error("delete_dataset", e),
        })
    }

    /// Read a page of a dataset's datapoints (data, target, metadata), newest first, with the
    /// dataset's total count.
    #[tool(name = "get_datapoints")]
    async fn get_datapoints(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<GetDatapointsParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let dataset = match params.dataset.identifier() {
            Ok(dataset) => dataset,
            Err(error) => return Ok(error),
        };
        let limit = params.limit.unwrap_or(100);
        let offset = params.offset.unwrap_or(0);
        if !(1..=MAX_DATAPOINTS_PAGE).contains(&limit) || offset < 0 {
            return Ok(tool_error(
                "limit must be between 1 and 1000 and offset must be non-negative",
            ));
        }
        let Some(clickhouse_ro) = self.clickhouse_ro.clone() else {
            return Ok(tool_error("ClickHouse read-only client is not configured"));
        };
        let result = service::fetch_datapoints_page(
            scope.project_id,
            dataset,
            limit,
            offset,
            clickhouse_ro,
            self.query_engine.clone(),
            self.http_client.clone(),
            self.db.clone(),
            self.cache.clone(),
        )
        .await;
        Ok(match result {
            Ok(Some((items, total_count))) => {
                tool_json(&json!({ "totalCount": total_count, "items": items }))
            }
            Ok(None) => tool_error("Dataset not found"),
            Err(e) => internal_error("get_datapoints", e),
        })
    }

    /// Append datapoints to a dataset. Set `createDataset` with `datasetName` to create the
    /// dataset if it is missing.
    #[tool(name = "add_datapoints")]
    async fn add_datapoints(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<AddDatapointsParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let dataset = match params.dataset.identifier() {
            Ok(dataset) => dataset,
            Err(error) => return Ok(error),
        };
        let datapoints = params
            .datapoints
            .into_iter()
            .map(|datapoint| NewDatapoint {
                id: None,
                data: datapoint.data,
                target: datapoint.target,
                metadata: datapoint.metadata.unwrap_or_default().into_iter().collect(),
                task_id: None,
            })
            .collect();
        let result = service::create_datapoints(
            scope.project_id,
            dataset,
            datapoints,
            params.create_dataset,
            self.db.clone(),
            self.clickhouse.clone(),
        )
        .await;
        let target = match &result {
            Ok(CreateDatapointsOutcome::Created { dataset_id, .. }) => AuditTarget::id(dataset_id),
            _ => AuditTarget::default(),
        };
        let created = matches!(result, Ok(CreateDatapointsOutcome::Created { .. }));
        self.audit(
            &scope,
            AuditResource::Datapoint,
            AuditAction::Create,
            created,
            target,
            None,
        )
        .await;
        Ok(match result {
            Ok(CreateDatapointsOutcome::Created {
                dataset_id,
                datapoints,
                dataset_was_created,
            }) => tool_json(&json!({
                "datasetId": dataset_id,
                "datasetCreated": dataset_was_created,
                "count": datapoints.len(),
                "datapointIds": datapoints.iter().map(|dp| dp.id).collect::<Vec<_>>(),
            })),
            Ok(CreateDatapointsOutcome::NoDatapoints) => tool_error("No datapoints provided"),
            Ok(CreateDatapointsOutcome::DatasetNameConflict) => {
                tool_error("A dataset with this name already exists")
            }
            Ok(CreateDatapointsOutcome::NameRequiredForCreate) => {
                tool_error("`createDataset` needs `datasetName`")
            }
            Ok(CreateDatapointsOutcome::DatasetNotFound) => tool_error(
                "Dataset not found. Pass `createDataset: true` with `datasetName` to create it.",
            ),
            Err(e) => internal_error("add_datapoints", e),
        })
    }
}
