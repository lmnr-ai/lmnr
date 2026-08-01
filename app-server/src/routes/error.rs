use actix_web::http::StatusCode;
use actix_web::{HttpResponse, ResponseError};

use crate::sql::SqlQueryError;

/// Actix's default 413 bodies vary by extractor and the `Bytes` one ("payload reached size
/// limit") names neither the size nor the limit, so SDKs log it verbatim with nothing actionable.
///
/// The limit applies to the DECODED body, so a compressed request (the OTLP exporters gzip by
/// default) has a Content-Length well under the limit. Reporting it as "N exceeds LIMIT" would
/// read as a contradiction, so a compressed body only gets its wire size labelled as such.
pub fn payload_too_large_message(
    content_length: Option<usize>,
    content_encoding: Option<&str>,
    limit: usize,
) -> String {
    let compressed = content_encoding.is_some_and(|e| !e.eq_ignore_ascii_case("identity"));
    let size = match (content_length, compressed) {
        (Some(bytes), false) => format!("request body is {bytes} bytes, which exceeds"),
        (Some(bytes), true) => {
            format!("request body is {bytes} compressed bytes and exceeds, once decompressed,")
        }
        (None, _) => "request body exceeds".to_string(),
    };
    format!(
        "Payload too large: {size} the server's HTTP payload limit of {limit} bytes. \
         Send fewer spans per batch, or reduce the size of individual span inputs and outputs. \
         Self-hosted deployments can raise the HTTP_PAYLOAD_LIMIT environment variable."
    )
}

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("{0}")]
    InternalAnyhowError(#[from] anyhow::Error),
    #[error("{0}")]
    SqlQueryError(#[from] SqlQueryError),
}

impl ResponseError for Error {
    fn status_code(&self) -> StatusCode {
        match &self {
            Self::InternalAnyhowError(_) => StatusCode::INTERNAL_SERVER_ERROR,
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

#[cfg(test)]
mod tests {
    use super::payload_too_large_message;

    #[test]
    fn uncompressed_body_reports_its_size_against_the_limit() {
        let msg = payload_too_large_message(Some(60_044), None, 10_000);
        assert!(msg.contains("request body is 60044 bytes, which exceeds"));
        assert!(msg.contains("limit of 10000 bytes"));
        assert!(msg.contains("HTTP_PAYLOAD_LIMIT"));
    }

    #[test]
    fn compressed_body_size_is_labelled_compressed() {
        // The limit applies post-decompression, so a gzipped body's Content-Length is
        // legitimately below the limit — the message must not read as a contradiction.
        let msg = payload_too_large_message(Some(2_425), Some("gzip"), 10_000);
        assert!(msg.contains("2425 compressed bytes"));
        assert!(msg.contains("once decompressed"));
    }

    #[test]
    fn identity_encoding_is_not_treated_as_compressed() {
        let msg = payload_too_large_message(Some(60_044), Some("identity"), 10_000);
        assert!(msg.contains("request body is 60044 bytes, which exceeds"));
        assert!(!msg.contains("compressed"));
    }

    #[test]
    fn missing_content_length_still_names_the_limit() {
        let msg = payload_too_large_message(None, None, 10_000);
        assert!(msg.contains("request body exceeds"));
        assert!(msg.contains("limit of 10000 bytes"));
    }
}
