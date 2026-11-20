//! Streamed request bodies shared by the routes that store archives in S3
//! (`hosted_evals`, `datasets_v2`).

use actix_web::{HttpResponse, error::PayloadError, http::StatusCode};
use anyhow::anyhow;
use bytes::{Bytes, BytesMut};
use futures_util::{Stream, StreamExt};
use serde_json::json;
use tokio::sync::mpsc::{self, Sender};

use crate::{
    hosted_evals::ArchiveIndex,
    storage::{Storage, StorageTrait},
};

// Streamed bodies aren't covered by the global HTTP payload limit, so each gets its own.
pub const MAX_ARCHIVE_BYTES: u64 = 1024 * 1024 * 1024;
pub const MAX_INDEX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug)]
pub enum BodyError {
    Empty,
    TooLarge(u64),
    Payload(PayloadError),
}

/// Why [`store_index`] didn't store an archive's index.
pub enum IndexError {
    Body(BodyError),
    Invalid(serde_json::Error),
    ArchiveMissing,
    /// The S3 operation that failed, and why.
    Upstream(&'static str, anyhow::Error),
}

/// Pumps `payload` into `tx` up to `max_bytes`. Any failure sends an `Err`
/// down the channel so the upload aborts instead of storing a partial object.
pub async fn forward_payload<S>(
    mut payload: S,
    tx: Sender<anyhow::Result<Bytes>>,
    max_bytes: u64,
) -> Result<(), BodyError>
where
    S: Stream<Item = Result<Bytes, PayloadError>> + Unpin,
{
    let mut size = 0;
    let result = loop {
        match payload.next().await {
            None if size == 0 => break Err(BodyError::Empty),
            None => break Ok(()),
            Some(Err(e)) => break Err(BodyError::Payload(e)),
            Some(Ok(chunk)) => {
                size += chunk.len() as u64;
                if size > max_bytes {
                    break Err(BodyError::TooLarge(max_bytes));
                }
                // A closed channel means the upload already failed and reports why.
                if tx.send(Ok(chunk)).await.is_err() {
                    break Ok(());
                }
            }
        }
    };
    if result.is_err() {
        let _ = tx.send(Err(anyhow!("upload aborted"))).await;
    }
    result
}

pub async fn collect_payload<S>(mut payload: S, max_bytes: u64) -> Result<Bytes, BodyError>
where
    S: Stream<Item = Result<Bytes, PayloadError>> + Unpin,
{
    let mut body = BytesMut::new();
    while let Some(chunk) = payload.next().await {
        let chunk = chunk.map_err(BodyError::Payload)?;
        if (body.len() + chunk.len()) as u64 > max_bytes {
            return Err(BodyError::TooLarge(max_bytes));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body.freeze())
}

/// Stores an archive's index (`ArchiveIndex` JSON, as sent) next to it, after
/// checking it parses and that the archive exists.
pub async fn store_index<S>(
    storage: &Storage,
    bucket: &str,
    archive_key: &str,
    index_key: &str,
    payload: S,
) -> Result<(), IndexError>
where
    S: Stream<Item = Result<Bytes, PayloadError>> + Unpin,
{
    let body = collect_payload(payload, MAX_INDEX_BYTES)
        .await
        .map_err(IndexError::Body)?;
    serde_json::from_slice::<ArchiveIndex>(&body).map_err(IndexError::Invalid)?;
    match storage.exists(bucket, archive_key).await {
        Ok(true) => {}
        Ok(false) => return Err(IndexError::ArchiveMissing),
        Err(e) => return Err(IndexError::Upstream("archive check", e)),
    }

    let (tx, rx) = mpsc::channel(1);
    let _ = tx.send(Ok(body)).await;
    drop(tx);
    storage
        .upload_stream(bucket, index_key, rx)
        .await
        .map(|_| ())
        .map_err(|e| IndexError::Upstream("index upload", e))
}

pub fn body_error_response(error: BodyError) -> HttpResponse {
    match error {
        BodyError::Empty => HttpResponse::BadRequest().json(json!({
            "error": "Empty body",
            "code": "empty_body",
        })),
        BodyError::TooLarge(max) => HttpResponse::PayloadTooLarge().json(json!({
            "error": format!("Body exceeds {max} bytes"),
            "code": "body_too_large",
        })),
        BodyError::Payload(e) => HttpResponse::BadRequest().json(json!({
            "error": format!("Failed to read body: {e}"),
            "code": "invalid_body",
        })),
    }
}

/// S3 or another upstream failed. Their errors can carry upstream response
/// bodies, so the client only gets a generic message; the cause is logged.
pub fn upstream_error(feature: &str, operation: &str, error: anyhow::Error) -> HttpResponse {
    log::error!("{feature} {operation} failed: {error:?}");
    HttpResponse::build(StatusCode::BAD_GATEWAY).json(json!({
        "error": format!("{feature} {operation} failed upstream. Retry shortly."),
        "code": "upstream_error",
    }))
}

#[cfg(test)]
mod tests {
    use futures_util::stream;

    use super::*;

    fn chunks(sizes: &[usize]) -> impl Stream<Item = Result<Bytes, PayloadError>> + Unpin {
        stream::iter(
            sizes
                .iter()
                .map(|n| Ok(Bytes::from(vec![0u8; *n])))
                .collect::<Vec<_>>(),
        )
    }

    #[tokio::test]
    async fn forward_payload_caps_the_body_and_aborts_the_upload() {
        let (tx, mut rx) = mpsc::channel(8);
        let result = forward_payload(chunks(&[4, 4, 4]), tx, 10).await;
        assert!(matches!(result, Err(BodyError::TooLarge(10))));
        assert!(rx.recv().await.unwrap().is_ok());
        assert!(rx.recv().await.unwrap().is_ok());
        assert!(rx.recv().await.unwrap().is_err());

        let (tx, mut rx) = mpsc::channel(8);
        assert!(forward_payload(chunks(&[5, 5]), tx, 10).await.is_ok());
        assert!(rx.recv().await.unwrap().is_ok());
        assert!(rx.recv().await.unwrap().is_ok());
        assert!(rx.recv().await.is_none());

        let (tx, mut rx) = mpsc::channel(8);
        let result = forward_payload(chunks(&[]), tx, 10).await;
        assert!(matches!(result, Err(BodyError::Empty)));
        assert!(rx.recv().await.unwrap().is_err());
    }

    #[tokio::test]
    async fn collect_payload_caps_the_body() {
        assert_eq!(collect_payload(chunks(&[3, 3]), 6).await.unwrap().len(), 6);
        assert!(matches!(
            collect_payload(chunks(&[3, 4]), 6).await,
            Err(BodyError::TooLarge(6))
        ));
    }
}
