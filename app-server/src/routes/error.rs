use actix_web::http::StatusCode;
use actix_web::{HttpResponse, ResponseError};

use crate::sql::SqlQueryError;

/// Encodings actix actually decodes (`actix_http::encoding::Decoder`); anything else is passed
/// through as-is, so its `Content-Length` IS the length the limit was applied to.
const DECODED_ENCODINGS: [&str; 4] = ["gzip", "br", "deflate", "zstd"];

/// Actix's default 413 bodies vary by extractor and the `Bytes` one ("payload reached size
/// limit") names neither the size nor the limit, so SDKs log it verbatim with nothing actionable.
///
/// This runs for EVERY route, so the remediation stays about the request body in general rather
/// than naming spans — `/v1/datasets/datapoints`, `/v1/labeling_queues/*` and the SQL routes can
/// all 413 with no span involved.
///
/// The limit applies to the DECODED body, so a compressed request (the OTLP exporters gzip by
/// default) has a Content-Length well under the limit. Reporting it as "N exceeds LIMIT" would
/// read as a contradiction, so a compressed body only gets its wire size labelled as such.
pub fn payload_too_large_message(
    content_length: Option<usize>,
    content_encoding: Option<&str>,
    limit: usize,
) -> String {
    let decoded = content_encoding.is_some_and(|header| {
        // A comma-separated list is applied left-to-right; if any layer is one we decode, the
        // wire size no longer corresponds to what the limit measured.
        header
            .split(',')
            .any(|e| DECODED_ENCODINGS.contains(&e.trim().to_ascii_lowercase().as_str()))
    });
    let size = match (content_length, decoded) {
        (Some(bytes), false) => format!("request body is {bytes} bytes, which exceeds"),
        (Some(bytes), true) => {
            format!("request body is {bytes} compressed bytes and exceeds, once decompressed,")
        }
        (None, _) => "request body exceeds".to_string(),
    };
    format!(
        "Payload too large: {size} the server's HTTP payload limit of {limit} bytes. \
         Split the request into smaller batches, or reduce the size of individual items in it \
         (for trace ingestion, that means fewer spans per batch or smaller span inputs and \
         outputs). Self-hosted deployments can raise the HTTP_PAYLOAD_LIMIT environment variable."
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
    fn an_encoding_actix_does_not_decode_is_not_treated_as_compressed() {
        // actix only decodes gzip/br/deflate/zstd; anything else reaches the handler as-is, so
        // its Content-Length IS what the limit measured and must not be called "compressed".
        for encoding in ["compress", "unknown-thing", ""] {
            let msg = payload_too_large_message(Some(60_044), Some(encoding), 10_000);
            assert!(
                msg.contains("request body is 60044 bytes, which exceeds"),
                "encoding {encoding:?} should be reported as a plain size"
            );
            assert!(!msg.contains("compressed"), "encoding {encoding:?}");
        }
    }

    #[test]
    fn decoded_encodings_are_detected_case_insensitively_and_in_a_list() {
        for encoding in ["gzip", "GZIP", " br ", "zstd", "deflate", "gzip, identity"] {
            let msg = payload_too_large_message(Some(2_425), Some(encoding), 10_000);
            assert!(
                msg.contains("2425 compressed bytes"),
                "encoding {encoding:?} should be reported as compressed"
            );
        }
    }

    #[test]
    fn remediation_is_not_span_specific() {
        // The handler is global — /v1/datasets/datapoints and the SQL routes 413 with no span
        // involved, so the advice must not read as though every payload is a span batch.
        let msg = payload_too_large_message(Some(60_044), None, 10_000);
        assert!(msg.contains("Split the request into smaller batches"));
        assert!(msg.contains("for trace ingestion"));
    }

    #[test]
    fn missing_content_length_still_names_the_limit() {
        let msg = payload_too_large_message(None, None, 10_000);
        assert!(msg.contains("request body exceeds"));
        assert!(msg.contains("limit of 10000 bytes"));
    }
}
