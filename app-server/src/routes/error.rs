use actix_web::http::StatusCode;
use actix_web::{HttpResponse, ResponseError};
use itertools::Itertools;
use log::error;
use serde_json::Value;
use uuid::Uuid;

use crate::db::workspace::WorkspaceError;
use crate::engine::engine::EngineOutput;
use crate::pipeline::runner::PipelineRunnerError;
use crate::pipeline::GraphError;

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("{0}")]
    InternalAnyhowError(#[from] anyhow::Error),
    #[error("{0}")]
    MultipartError(#[from] actix_multipart::MultipartError),
    #[error("Request error, error_code: {error_code:?}, error_message: {error_message:?}")]
    RequestError {
        error_code: String,
        error_message: Option<serde_json::Value>,
    },
}

// This can be refactored, but for now it can be used as a single source to see
// all the error codes to be handled in frontend
impl Error {
    pub fn invalid_request(error_message: Option<&str>) -> Self {
        Self::RequestError {
            error_code: "api.invalidRequest".to_string(),
            error_message: error_message.map(|s| Value::String(s.to_string())),
        }
    }

    pub fn deserialization_error(error: Option<serde_json::Error>) -> Self {
        Self::RequestError {
            error_code: "api.deserializationError".to_string(),
            error_message: error.map(|s| Value::String(s.to_string())),
        }
    }

    pub fn runner_missing_graph_input(input_name: Option<&str>) -> Self {
        Self::RequestError {
            error_code: "api.missingGraphInput".to_string(),
            error_message: if let Some(input_name) = input_name {
                Some(Value::String(format!(
                    "Graph input is missing: {}",
                    input_name
                )))
            } else {
                Some(Value::String("Graph has missing inputs.".to_string()))
            },
        }
    }

    pub fn no_target_pipeline(pipeline_name: &String) -> Self {
        Self::RequestError {
            error_code: "api.noTargetPipeline".to_string(),
            error_message: Some(Value::String(
                format!("Pipeline has no target pipeline. There is no pipeline '{pipeline_name}', or it does not have a target version.
            
Set the target version for the pipeline in the pipeline builder."),
            )),
        }
    }

    pub fn graph_running_error(trace: EngineOutput, run_id: Uuid) -> Self {
        Self::RequestError {
            error_code: "api.GraphRunningError".to_string(),
            error_message: Some(serde_json::json!(
            {
                "runId": run_id.to_string(),
                "nodeErrors": trace
            })),
        }
    }

    pub fn user_not_found(email: String) -> Self {
        Self::RequestError {
            error_code: "api.UserNotFound".to_string(),
            error_message: Some(Value::String(format!("User not found: {}", email))),
        }
    }

    pub fn limit_error(error_message: &str) -> Self {
        Self::RequestError {
            error_code: "api.LimitReached".to_string(),
            error_message: Some(Value::String(error_message.to_string())),
        }
    }
}

pub fn workspace_error_to_http_error(e: WorkspaceError) -> Error {
    match e {
        WorkspaceError::UserNotFound(email) => Error::user_not_found(email),
        WorkspaceError::UnhandledError(e) => Error::InternalAnyhowError(e),
        WorkspaceError::LimitReached {
            entity,
            limit,
            usage,
        } => Error::limit_error(&format!(
            "Limit reached for {}. Limit: {}. Current {}: {}",
            entity, limit, entity, usage
        )),
    }
}

pub fn graph_error_to_http_error(e: GraphError) -> Error {
    match e {
        GraphError::InputMissing(input_name) => {
            Error::runner_missing_graph_input(Some(&input_name))
        }
        GraphError::UnhandledError(e) => Error::InternalAnyhowError(e),
    }
}

pub fn pipeline_runner_to_http_error(e: PipelineRunnerError, run_id: Uuid) -> Error {
    match e {
        PipelineRunnerError::GraphError(e) => graph_error_to_http_error(e),
        PipelineRunnerError::DeserializationError(e) => Error::deserialization_error(Some(e)),
        PipelineRunnerError::RunningError(e) => Error::graph_running_error(e.partial_trace, run_id),
        PipelineRunnerError::UnhandledError(e) => Error::InternalAnyhowError(e),
        PipelineRunnerError::MissingEnvVarsError(e) => Error::invalid_request(Some(
            format!(
                "Missing env vars: {}",
                e.missing_env_vars.into_iter().join(", ")
            )
            .as_str(),
        )),
        // TODO: rethink how trace writing errors are handled. For now,
        // trace write results are ignored using `let _ =`
        PipelineRunnerError::TraceWritingError(e) => Error::InternalAnyhowError(anyhow::anyhow!(e)),
        PipelineRunnerError::InvalidSchemasError(e) => Error::invalid_request(Some(
            format!(
                "Invalid templates: {}",
                serde_json::to_string(&e.invalid_schemas).unwrap()
            )
            .as_str(),
        )),
    }
}

impl ResponseError for Error {
    fn status_code(&self) -> StatusCode {
        match &self {
            Self::InternalAnyhowError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Self::MultipartError(_) => StatusCode::BAD_REQUEST,
            Self::RequestError { .. } => StatusCode::BAD_REQUEST,
        }
    }

    fn error_response(&self) -> HttpResponse {
        error!("Error: {:?}", self.to_string());
        match &self {
            Self::RequestError {
                error_code,
                error_message,
            } => HttpResponse::BadRequest().json(serde_json::json!({
                    "error_code": error_code.clone(),
                    "error_message": error_message.clone(),
            })),
            _ => HttpResponse::build(self.status_code()).finish(),
        }
    }
}
