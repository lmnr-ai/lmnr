//! Debug session tools: the MCP twins of `lmnr-cli debug session set-name / add-note / summary`.
//! The CLI defaults the session id from `.lmnr/debug-session.json`; over MCP it is explicit.

use rmcp::{
    ErrorData as McpError, RoleServer, handler::server::wrapper::Parameters,
    model::CallToolResponse, schemars, service::RequestContext, tool, tool_router,
};
use serde_json::json;
use uuid::Uuid;

use super::{AuditTarget, LaminarMcpServer, ProjectParam, internal_error, tool_error, tool_json};
use crate::{
    api::v1::debugger::{self, AddBlockRequest},
    audit::{AuditAction, AuditResource},
    db::{debugger_session_blocks, debugger_sessions::debugger_session_exists},
};

const SESSION_NOT_FOUND: &str = "Debug session not found in this project";

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DebugSessionParams {
    /// The debug session id (`.lmnr/debug-session.json` `session_id` locally).
    pub session_id: Uuid,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RenameDebugSessionParams {
    pub session_id: Uuid,
    pub name: String,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AddDebugSessionNoteParams {
    pub session_id: Uuid,
    pub note: String,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[tool_router(router = debug_session_tools, vis = "pub(super)")]
impl LaminarMcpServer {
    /// Read a debug session's timeline: its trace, evaluation and note blocks, oldest first.
    #[tool(name = "get_debug_session")]
    async fn get_debug_session(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<DebugSessionParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let pool = &self.db.pool;
        match debugger_session_exists(pool, &params.session_id, &scope.project_id).await {
            Ok(true) => {}
            Ok(false) => return Ok(tool_error(SESSION_NOT_FOUND)),
            Err(e) => return Ok(internal_error("get_debug_session", e)),
        }
        let blocks = debugger_session_blocks::get_blocks_for_session(
            pool,
            &scope.project_id,
            &params.session_id,
        )
        .await;
        Ok(match blocks {
            Ok(mut blocks) => {
                blocks.sort_by_key(|block| block.created_at);
                tool_json(&json!({ "sessionId": params.session_id, "blocks": blocks }))
            }
            Err(e) => internal_error("get_debug_session", e),
        })
    }

    /// Add a text note to a debug session's timeline, e.g. what you changed before the next run.
    #[tool(name = "add_debug_session_note")]
    async fn add_debug_session_note(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<AddDebugSessionNoteParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        if params.note.trim().is_empty() {
            return Ok(tool_error("The note is empty"));
        }
        let block = AddBlockRequest {
            block_type: "text".to_string(),
            content: json!({ "text": params.note }),
        };
        Ok(
            match debugger::add_block(
                scope.project_id,
                params.session_id,
                block,
                &self.db,
                &self.pubsub,
            )
            .await
            {
                Ok(Some(block_id)) => tool_json(&json!({
                    "sessionId": params.session_id,
                    "blockId": block_id,
                })),
                Ok(None) => tool_error(SESSION_NOT_FOUND),
                Err(e) => internal_error("add_debug_session_note", e),
            },
        )
    }

    /// Rename a debug session. Requires OAuth sign-in.
    #[tool(name = "rename_debug_session")]
    async fn rename_debug_session(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<RenameDebugSessionParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        if let Err(error) = Self::require_user(&scope) {
            return Ok(error);
        }
        let result = debugger::rename_session(
            scope.project_id,
            params.session_id,
            &params.name,
            &self.db,
            &self.pubsub,
        )
        .await;
        let renamed = matches!(result, Ok(true));
        self.audit(
            &scope,
            AuditResource::DebuggerSession,
            AuditAction::Update,
            renamed,
            AuditTarget::named(params.session_id, &params.name),
            None,
        )
        .await;
        Ok(match result {
            Ok(true) => tool_json(&json!({ "sessionId": params.session_id, "name": params.name })),
            Ok(false) => tool_error(SESSION_NOT_FOUND),
            Err(e) => internal_error("rename_debug_session", e),
        })
    }
}
