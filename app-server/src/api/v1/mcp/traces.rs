//! Trace write tools: the MCP twin of `lmnr-cli trace tag add`.

use rmcp::{
    ErrorData as McpError, RoleServer, handler::server::wrapper::Parameters,
    model::CallToolResponse, schemars, service::RequestContext, tool, tool_router,
};
use serde_json::json;
use uuid::Uuid;

use super::{
    LaminarMcpServer, ProjectParam, ProjectScope, TRACE_ID_PATTERN, ToolError, ToolOutput,
};
use crate::ch::trace_tags::add_trace_tags;

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AddTraceTagsParams {
    /// The trace to tag, as `traces.id` or `spans.trace_id` from `query_laminar_sql`.
    #[schemars(with = "String", regex(pattern = TRACE_ID_PATTERN))]
    pub trace_id: Uuid,
    /// Tag names to add; tags the trace already has are kept.
    #[schemars(length(min = 1))]
    pub tags: Vec<String>,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[tool_router(router = trace_tools, vis = "pub(super)")]
impl LaminarMcpServer {
    /// Add tags to a trace, e.g. to mark traces you reviewed. Existing tags are kept, and adding
    /// a tag the trace already has changes nothing. Tags are queryable with `query_laminar_sql`
    /// (`traces.tags`). Returns the trace id and the tags added.
    #[tool(
        name = "add_trace_tags",
        title = "Add trace tags",
        annotations(
            title = "Add trace tags",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn add_trace_tags(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<AddTraceTagsParams>,
    ) -> Result<CallToolResponse, McpError> {
        // Unaudited, like `/v1/tag` and UI tagging.
        self.run(
            "add_trace_tags",
            &context,
            params.project.project_id,
            None,
            |scope: ProjectScope| async move {
                let tags: Vec<String> = params
                    .tags
                    .into_iter()
                    .map(|tag| tag.trim().to_string())
                    .filter(|tag| !tag.is_empty())
                    .collect();
                if tags.is_empty() {
                    return Err(ToolError::message("No tags provided"));
                }
                add_trace_tags(
                    self.clickhouse.clone(),
                    scope.project_id,
                    params.trace_id,
                    tags.clone(),
                )
                .await?;
                Ok(ToolOutput::json(
                    &json!({ "traceId": params.trace_id, "tags": tags }),
                ))
            },
        )
        .await
    }
}
