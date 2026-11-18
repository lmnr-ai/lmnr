//! Trace write tools: the MCP twin of `lmnr-cli trace tag add`.

use rmcp::{
    ErrorData as McpError, RoleServer, handler::server::wrapper::Parameters,
    model::CallToolResponse, schemars, service::RequestContext, tool, tool_router,
};
use serde_json::json;
use uuid::Uuid;

use super::{
    LaminarMcpServer, ProjectParam, TRACE_ID_PATTERN, internal_error, tool_error, tool_json,
};
use crate::ch::trace_tags::add_trace_tags;

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AddTraceTagsParams {
    #[schemars(with = "String", regex(pattern = TRACE_ID_PATTERN))]
    pub trace_id: Uuid,
    /// Tag names to add; tags the trace already has are kept.
    pub tags: Vec<String>,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[tool_router(router = trace_tools, vis = "pub(super)")]
impl LaminarMcpServer {
    /// Add tags to a trace, e.g. to mark traces you reviewed. Tags are queryable with
    /// `query_laminar_sql` (`traces.tags`).
    #[tool(name = "add_trace_tags")]
    async fn add_trace_tags(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<AddTraceTagsParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let tags: Vec<String> = params
            .tags
            .into_iter()
            .map(|tag| tag.trim().to_string())
            .filter(|tag| !tag.is_empty())
            .collect();
        if tags.is_empty() {
            return Ok(tool_error("No tags provided"));
        }
        // Unaudited, like `/v1/tag` and UI tagging.
        match add_trace_tags(
            self.clickhouse.clone(),
            scope.project_id,
            params.trace_id,
            tags.clone(),
        )
        .await
        {
            Ok(()) => Ok(tool_json(
                &json!({ "traceId": params.trace_id, "tags": tags }),
            )),
            Err(e) => Ok(internal_error("add_trace_tags", e)),
        }
    }
}
