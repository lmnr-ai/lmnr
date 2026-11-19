//! Signal tools: the MCP twins of `lmnr-cli signal`. Same `signals::service` calls as the
//! `/v1/cli/signals` and `/v1/signals` handlers. Project API keys get every tool, like `/v1/signals`;
//! a key has no user, so a signal it creates gets an alert with no subscriber.

use rmcp::{
    ErrorData as McpError, RoleServer, handler::server::wrapper::Parameters,
    model::CallToolResponse, schemars, service::RequestContext, tool, tool_router,
};
use serde_json::json;
use uuid::Uuid;

use super::{
    Audit, AuditTarget, LaminarMcpServer, McpCaller, ProjectParam, ProjectScope, ToolError,
    ToolOutput,
};
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
    /// Stop sampling, so the signal runs on every matching trace. `sampleRate: null` does not.
    #[serde(default)]
    pub clear_sample_rate: bool,
    #[serde(flatten)]
    pub project: ProjectParam,
}

impl UpdateSignalParams {
    /// The service input, with sampling cleared only on request: schema-driven clients often
    /// send `null` for every optional field they leave unset.
    fn try_into_update(self) -> Result<UpdateSignalInput, ToolError> {
        let mut update = self.update;
        update.sample_rate = match (update.sample_rate, self.clear_sample_rate) {
            (Some(Some(_)), true) => {
                return Err(ToolError::message(
                    "Pass either `sampleRate` or `clearSampleRate`, not both.",
                ));
            }
            (_, true) => Some(None),
            (Some(Some(rate)), false) => Some(Some(rate)),
            (_, false) => None,
        };
        Ok(update)
    }
}

impl From<CrudError> for ToolError {
    fn from(error: CrudError) -> Self {
        match error {
            CrudError::Internal(e) => Self::Internal(e),
            e => Self::message(e.to_string()),
        }
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
        self.run(
            "list_signals",
            &context,
            params.project.project_id,
            None,
            |scope: ProjectScope| async move {
                let signals =
                    service::list_signals(&self.db.pool, scope.project_id, params.name.as_deref())
                        .await?;
                Ok(ToolOutput::json(&json!({ "signals": signals })))
            },
        )
        .await
    }

    /// Get one signal with its trigger, filters and mode.
    #[tool(name = "get_signal")]
    async fn get_signal(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<SignalIdParams>,
    ) -> Result<CallToolResponse, McpError> {
        self.run(
            "get_signal",
            &context,
            params.project.project_id,
            None,
            |scope: ProjectScope| async move {
                let signal =
                    service::get_signal(&self.db.pool, scope.project_id, params.signal_id).await?;
                Ok(ToolOutput::json(&signal))
            },
        )
        .await
    }

    /// List a signal's judge-definition (prompt + payload schema) versions, oldest first.
    #[tool(name = "list_signal_versions")]
    async fn list_signal_versions(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<SignalIdParams>,
    ) -> Result<CallToolResponse, McpError> {
        self.run(
            "list_signal_versions",
            &context,
            params.project.project_id,
            None,
            |scope: ProjectScope| async move {
                let versions = service::list_signal_versions(
                    &self.db.pool,
                    scope.project_id,
                    params.signal_id,
                )
                .await?;
                Ok(ToolOutput::json(&json!({ "versions": versions })))
            },
        )
        .await
    }

    /// Create a signal: an LLM judge that runs `prompt` on matching traces and extracts a
    /// payload matching `structuredOutput`. Three things decide when it runs: `trigger` (when it
    /// is evaluated: `rootSpanFinished`, or `spanName` with `spanNames` for distributed traces),
    /// `filters` (whether it runs on a trace that fired) and `mode` (`realtime` or `batch`).
    /// Like the UI, this also creates a critical-severity alert, subscribed to your email when
    /// signed in with OAuth.
    #[tool(name = "create_signal")]
    async fn create_signal(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<CreateSignalParams>,
    ) -> Result<CallToolResponse, McpError> {
        self.run(
            "create_signal",
            &context,
            params.project.project_id,
            Some(Audit::new(AuditResource::Signal, AuditAction::Create)),
            |scope: ProjectScope| async move {
                let email = match &scope.caller {
                    McpCaller::User(user) => {
                        db::users::get_user_email(&self.db.pool, user.user_id).await?
                    }
                    McpCaller::ApiKey(_) => None,
                };
                let signal = service::create_signal(
                    self.db.clone(),
                    self.cache.clone(),
                    scope.project_id,
                    email.as_deref(),
                    params.signal,
                    is_feature_enabled(Feature::Clustering),
                )
                .await?;
                Ok(ToolOutput::json(&signal).target(AuditTarget::named(signal.id, &signal.name)))
            },
        )
        .await
    }

    /// Update a signal; only the fields you pass change. Changing `prompt` or
    /// `structuredOutput` adds a definition version.
    #[tool(name = "update_signal")]
    async fn update_signal(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<UpdateSignalParams>,
    ) -> Result<CallToolResponse, McpError> {
        let audit = Audit::new(AuditResource::Signal, AuditAction::Update)
            .target(AuditTarget::id(params.signal_id));
        self.run(
            "update_signal",
            &context,
            params.project.project_id,
            Some(audit),
            |scope: ProjectScope| async move {
                let signal_id = params.signal_id;
                let update = params.try_into_update()?;
                let signal = service::update_signal(
                    &self.db.pool,
                    &self.cache,
                    scope.project_id,
                    signal_id,
                    update,
                )
                .await?;
                Ok(ToolOutput::json(&signal).target(AuditTarget::named(signal.id, &signal.name)))
            },
        )
        .await
    }

    /// Delete a signal with its triggers, alerts and events. Irreversible.
    #[tool(name = "delete_signal")]
    async fn delete_signal(
        &self,
        context: RequestContext<RoleServer>,
        Parameters(params): Parameters<SignalIdParams>,
    ) -> Result<CallToolResponse, McpError> {
        let audit = Audit::new(AuditResource::Signal, AuditAction::Delete)
            .target(AuditTarget::id(params.signal_id));
        self.run(
            "delete_signal",
            &context,
            params.project.project_id,
            Some(audit),
            |scope: ProjectScope| async move {
                let signal = service::delete_signal(
                    &self.db.pool,
                    &self.cache,
                    &self.clickhouse,
                    scope.project_id,
                    params.signal_id,
                )
                .await?;
                Ok(ToolOutput::json(&signal).target(AuditTarget::named(signal.id, &signal.name)))
            },
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(args: serde_json::Value) -> UpdateSignalParams {
        let mut body = json!({ "signalId": Uuid::new_v4() });
        body.as_object_mut()
            .unwrap()
            .extend(args.as_object().unwrap().clone());
        serde_json::from_value(body).unwrap()
    }

    #[test]
    fn null_sample_rate_leaves_sampling_alone() {
        let update = params(json!({ "sampleRate": null, "prompt": null }))
            .try_into_update()
            .ok()
            .unwrap();
        assert_eq!(update.sample_rate, None);
        assert_eq!(
            params(json!({}))
                .try_into_update()
                .ok()
                .unwrap()
                .sample_rate,
            None
        );
    }

    #[test]
    fn sampling_changes_only_on_request() {
        let set = params(json!({ "sampleRate": 25 }))
            .try_into_update()
            .ok()
            .unwrap();
        assert_eq!(set.sample_rate, Some(Some(25)));
        let cleared = params(json!({ "clearSampleRate": true, "sampleRate": null }))
            .try_into_update()
            .ok()
            .unwrap();
        assert_eq!(cleared.sample_rate, Some(None));
        assert!(
            params(json!({ "clearSampleRate": true, "sampleRate": 25 }))
                .try_into_update()
                .is_err()
        );
    }
}
