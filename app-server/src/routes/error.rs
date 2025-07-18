use actix_web::http::StatusCode;
use actix_web::{HttpResponse, ResponseError};
use log::error;

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("{0}")]
    InternalAnyhowError(#[from] anyhow::Error),
    #[error("{0}")]
    MultipartError(#[from] actix_multipart::MultipartError),
}

impl ResponseError for Error {
    fn status_code(&self) -> StatusCode {
        match &self {
            Self::InternalAnyhowError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Self::MultipartError(_) => StatusCode::BAD_REQUEST,
        }
    }

    fn error_response(&self) -> HttpResponse {
        error!("Error: {:?}", self.to_string());
        HttpResponse::build(self.status_code()).finish()
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
