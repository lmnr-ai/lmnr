//! Signal tools: the MCP twins of `lmnr-cli signal`. Same `signals::service` calls as the
//! `/v1/cli/signals` handlers. Writes need a signed-in user: the project-API-key surface has no
//! signal writes, and a new signal's alert subscribes its creator's email.

use rmcp::{
    ErrorData as McpError, RoleServer, handler::server::wrapper::Parameters,
    model::CallToolResponse, schemars, service::RequestContext, tool, tool_router,
};
use serde_json::json;
use uuid::Uuid;

use super::{AuditTarget, LaminarMcpServer, ProjectParam, internal_error, tool_error, tool_json};
use crate::{
    audit::{AuditAction, AuditResource},
    db,
    features::{Feature, is_feature_enabled},
    signals::service::{self, CrudError, SignalInput, UpdateSignalInput},
};

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListSignalsParams {
    /// Case-insensitive substring of the signal name.
    #[serde(default)]
    pub name: Option<String>,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignalIdParams {
    pub signal_id: Uuid,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateSignalParams {
    #[serde(flatten)]
    pub signal: SignalInput,
    #[serde(flatten)]
    pub project: ProjectParam,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSignalParams {
    pub signal_id: Uuid,
    /// Only the fields you pass change.
    #[serde(flatten)]
    pub update: UpdateSignalInput,
    #[serde(flatten)]
    pub project: ProjectParam,
}

fn signal_error(tool: &str, error: CrudError) -> CallToolResponse {
    match error {
        CrudError::Internal(e) => internal_error(tool, e),
        e => tool_error(e.to_string()),
    }
}

#[tool_router(router = signal_tools, vis = "pub(super)")]
impl LaminarMcpServer {
    /// List the project's signals (LLM analyzers that run on matching traces) with their prompt,
    /// payload schema, trigger, filters and mode. Signal events are queryable with
    /// `query_laminar_sql` (`signal_events`).
    #[tool(name = "list_signals")]
    async fn list_signals(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<ListSignalsParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let result =
            service::list_signals(&self.db.pool, scope.project_id, params.name.as_deref()).await;
        Ok(match result {
            Ok(signals) => tool_json(&json!({ "signals": signals })),
            Err(e) => signal_error("list_signals", e),
        })
    }

    /// Get one signal with its trigger, filters and mode.
    #[tool(name = "get_signal")]
    async fn get_signal(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<SignalIdParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let result = service::get_signal(&self.db.pool, scope.project_id, params.signal_id).await;
        Ok(match result {
            Ok(signal) => tool_json(&signal),
            Err(e) => signal_error("get_signal", e),
        })
    }

    /// List a signal's judge-definition (prompt + payload schema) versions, oldest first.
    #[tool(name = "list_signal_versions")]
    async fn list_signal_versions(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<SignalIdParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let result =
            service::list_signal_versions(&self.db.pool, scope.project_id, params.signal_id).await;
        Ok(match result {
            Ok(versions) => tool_json(&json!({ "versions": versions })),
            Err(e) => signal_error("list_signal_versions", e),
        })
    }

    /// Create a signal: an LLM judge that runs `prompt` on matching traces and extracts a
    /// payload matching `structuredOutput`. Three things decide when it runs: `trigger` (when it
    /// is evaluated: `rootSpanFinished`, or `spanName` with `spanNames` for distributed traces),
    /// `filters` (whether it runs on a trace that fired) and `mode` (`realtime` or `batch`).
    /// Like the UI, this also creates a critical-severity alert subscribed to your email.
    /// Requires OAuth sign-in.
    #[tool(name = "create_signal")]
    async fn create_signal(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<CreateSignalParams>,
    ) -> Result<CallToolResponse, McpError> {
        let scope = match self
            .project_scope(&context, params.project.project_id)
            .await
        {
            Ok(scope) => scope,
            Err(error) => return Ok(error),
        };
        let user_id = match Self::require_user(&scope) {
            Ok(user) => user.user_id,
            Err(error) => return Ok(error),
        };
        let email = match db::users::get_user_email(&self.db.pool, user_id).await {
            Ok(email) => email,
            Err(e) => return Ok(internal_error("create_signal", e)),
        };
        let result = service::create_signal(
            self.db.clone(),
            self.cache.clone(),
            scope.project_id,
            email.as_deref(),
            params.signal,
            is_feature_enabled(Feature::Clustering),
        )
        .await;
        let target = result
            .as_ref()
            .map(|signal| AuditTarget::named(signal.id, &signal.name))
            .unwrap_or_default();
        self.audit(
            &scope,
            AuditResource::Signal,
            AuditAction::Create,
            result.is_ok(),
            target,
            None,
        )
        .await;
        Ok(match result {
            Ok(signal) => tool_json(&signal),
            Err(e) => signal_error("create_signal", e),
        })
    }

    /// Update a signal; only the fields you pass change. Changing `prompt` or
    /// `structuredOutput` adds a definition version. Requires OAuth sign-in.
    #[tool(name = "update_signal")]
    async fn update_signal(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<UpdateSignalParams>,
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
        let result = service::update_signal(
            &self.db.pool,
            &self.cache,
            scope.project_id,
            params.signal_id,
            params.update,
        )
        .await;
        let target = result
            .as_ref()
            .map(|signal| AuditTarget::named(signal.id, &signal.name))
            .unwrap_or(AuditTarget::id(params.signal_id));
        self.audit(
            &scope,
            AuditResource::Signal,
            AuditAction::Update,
            result.is_ok(),
            target,
            None,
        )
        .await;
        Ok(match result {
            Ok(signal) => tool_json(&signal),
            Err(e) => signal_error("update_signal", e),
        })
    }

    /// Delete a signal with its triggers, alerts and events. Irreversible. Requires OAuth sign-in.
    #[tool(name = "delete_signal")]
    async fn delete_signal(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<SignalIdParams>,
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
        let result = service::delete_signal(
            &self.db.pool,
            &self.cache,
            &self.clickhouse,
            scope.project_id,
            params.signal_id,
        )
        .await;
        let target = result
            .as_ref()
            .map(|signal| AuditTarget::named(signal.id, &signal.name))
            .unwrap_or(AuditTarget::id(params.signal_id));
        self.audit(
            &scope,
            AuditResource::Signal,
            AuditAction::Delete,
            result.is_ok(),
            target,
            None,
        )
        .await;
        Ok(match result {
            Ok(signal) => tool_json(&signal),
            Err(e) => signal_error("delete_signal", e),
        })
    }
}
