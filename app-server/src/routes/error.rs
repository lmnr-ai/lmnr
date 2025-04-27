use actix_web::http::StatusCode;
use actix_web::{HttpResponse, ResponseError};
use log::error;
use serde_json::Value;

use crate::db::workspace::WorkspaceError;

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
    #[error("Forbidden")]
    Forbidden,
}

impl Error {
    pub fn limit_error(error_message: &str) -> Self {
        Self::RequestError {
            error_code: "api.LimitReached".to_string(),
            error_message: Some(Value::String(error_message.to_string())),
        }
    }
}

pub fn workspace_error_to_http_error(e: WorkspaceError) -> Error {
    match e {
        WorkspaceError::UnhandledError(e) => Error::InternalAnyhowError(e),
        WorkspaceError::LimitReached {
            entity,
            limit,
            usage,
        } => Error::limit_error(&format!(
            "Limit reached for {}. Limit: {}. Current {}: {}",
            entity, limit, entity, usage
        )),
        WorkspaceError::NotAllowed => Error::Forbidden,
    }
}

impl ResponseError for Error {
    fn status_code(&self) -> StatusCode {
        match &self {
            Self::InternalAnyhowError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Self::MultipartError(_) => StatusCode::BAD_REQUEST,
            Self::RequestError { .. } => StatusCode::BAD_REQUEST,
            Self::Forbidden => StatusCode::FORBIDDEN,
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

impl From<serde_json::Error> for Error {
    fn from(err: serde_json::Error) -> Self {
        Error::InternalAnyhowError(anyhow::anyhow!(err))
    }
}

impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Error::InternalAnyhowError(anyhow::anyhow!(err))
    }
}

impl From<clickhouse::error::Error> for Error {
    fn from(err: clickhouse::error::Error) -> Self {
        Error::InternalAnyhowError(anyhow::anyhow!(err))
    }
}
