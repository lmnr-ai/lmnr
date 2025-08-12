use actix_web::http::StatusCode;
use actix_web::{HttpResponse, ResponseError};

use crate::sql::SqlQueryError;

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("{0}")]
    InternalAnyhowError(#[from] anyhow::Error),
    #[error("{0}")]
    MultipartError(#[from] actix_multipart::MultipartError),
    #[error("{0}")]
    SqlQueryError(#[from] SqlQueryError),
}

impl ResponseError for Error {
    fn status_code(&self) -> StatusCode {
        match &self {
            Self::InternalAnyhowError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Self::MultipartError(_) => StatusCode::BAD_REQUEST,
            Self::SqlQueryError(e) => match e {
                SqlQueryError::ValidationError(_) => StatusCode::BAD_REQUEST,
                SqlQueryError::InternalError(_) => StatusCode::INTERNAL_SERVER_ERROR,
                SqlQueryError::BadResponseError(_) => StatusCode::BAD_REQUEST,
            },
        }
    }

    fn error_response(&self) -> HttpResponse {
        HttpResponse::build(self.status_code()).body(format!("{}", self))
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

impl From<sqlx::Error> for Error {
    fn from(err: sqlx::Error) -> Self {
        Error::InternalAnyhowError(anyhow::anyhow!(err))
    }
}
