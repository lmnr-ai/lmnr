//! Raw request bodies streamed to S3 (or another upstream) and the archive
//! indexes stored next to them. Shared by hosted evals (`api::v1::hosted_evals`)
//! and eval datasets (`api::v1::eval_datasets`).

use actix_web::{HttpResponse, error::PayloadError, http::StatusCode, web};
use anyhow::anyhow;
use bytes::{Bytes, BytesMut};
use futures_util::{Stream, StreamExt};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc::{self, Sender};

use crate::storage::{Storage, StorageTrait};

#[derive(Debug)]
pub enum BodyError {
    Empty,
    TooLarge(u64),
    Payload(PayloadError),
}

pub enum UploadError {
    Body(BodyError),
    Storage(anyhow::Error),
}

pub enum IndexError {
    Body(BodyError),
    Invalid(serde_json::Error),
    ArchiveMissing,
    /// `operation` names the failed step for the upstream error.
    Storage {
        operation: &'static str,
        error: anyhow::Error,
    },
}

/// Where each file sits in an uploaded archive (written by lmnr-cli's
/// `pack.ts`), so the frontend reads one file with a ranged GET instead of the
/// whole archive (`lib/actions/evaluation/files.ts`). Parsed here to reject a
/// malformed index; it is stored as sent.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveIndex {
    files: Vec<IndexedFile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct IndexedFile {
    /// POSIX path relative to the archive root.
    path: String,
    size: u64,
    /// Byte range of the gzip member holding the file.
    offset: u64,
    length: u64,
    /// Where the file's content starts in the decompressed member.
    data_offset: u64,
}

impl ArchiveIndex {
    /// Uncompressed size of the archived files.
    pub fn total_size(&self) -> u64 {
        self.files.iter().map(|f| f.size).sum()
    }
}

/// Streams `payload` (up to `max_bytes`) into `key`. A body error aborts the
/// upload, so no partial object is stored.
pub async fn upload_payload(
    storage: &Storage,
    bucket: &str,
    key: &str,
    payload: web::Payload,
    max_bytes: u64,
) -> Result<u64, UploadError> {
    // `web::Payload` isn't `Send`, so it's pumped through a channel the upload reads.
    let (tx, rx) = mpsc::channel(4);
    let (received, stored) = futures_util::join!(
        forward_payload(payload, tx, max_bytes),
        storage.upload_stream(bucket, key, rx)
    );
    received.map_err(UploadError::Body)?;
    stored.map_err(UploadError::Storage)
}

/// Stores an archive's index (`max_bytes` cap) next to it, after checking it
/// parses and that the archive exists. Returns the parsed index.
pub async fn store_index(
    storage: &Storage,
    bucket: &str,
    archive_key: &str,
    index_key: &str,
    payload: web::Payload,
    max_bytes: u64,
) -> Result<ArchiveIndex, IndexError> {
    let body = collect_payload(payload, max_bytes)
        .await
        .map_err(IndexError::Body)?;
    let index = serde_json::from_slice::<ArchiveIndex>(&body).map_err(IndexError::Invalid)?;
    match storage.exists(bucket, archive_key).await {
        Ok(true) => {}
        Ok(false) => return Err(IndexError::ArchiveMissing),
        Err(error) => {
            return Err(IndexError::Storage {
                operation: "archive check",
                error,
            });
        }
    }

    let (tx, rx) = mpsc::channel(1);
    let _ = tx.send(Ok(body)).await;
    drop(tx);
    storage
        .upload_stream(bucket, index_key, rx)
        .await
        .map_err(|error| IndexError::Storage {
            operation: "index upload",
            error,
        })?;
    Ok(index)
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

pub fn body_error_response(error: BodyError) -> HttpResponse {
    match error {
        BodyError::Empty => HttpResponse::BadRequest().json(json!({ "error": "Empty body" })),
        BodyError::TooLarge(max) => HttpResponse::PayloadTooLarge().json(json!({
            "error": format!("Body exceeds {max} bytes")
        })),
        BodyError::Payload(e) => HttpResponse::BadRequest().json(json!({
            "error": format!("Failed to read body: {e}")
        })),
    }
}

pub fn invalid_index_response(error: serde_json::Error) -> HttpResponse {
    HttpResponse::BadRequest().json(json!({
        "error": format!("Invalid archive index: {error}")
    }))
}

/// S3, the sandbox provider or the registry failed. Their errors can carry
/// upstream response bodies, so the client only gets a generic message naming
/// `what` failed (e.g. "Hosted evals archive upload").
pub fn upstream_error(what: &str, error: anyhow::Error) -> HttpResponse {
    log::error!("{what} failed: {error:?}");
    HttpResponse::build(StatusCode::BAD_GATEWAY).json(json!({
        "error": format!("{what} failed upstream. Retry shortly.")
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

    #[test]
    fn archive_index_sums_file_sizes() {
        let index: ArchiveIndex = serde_json::from_str(
            r#"{"files": [
                {"path": "task.toml", "size": 10, "offset": 0, "length": 40, "dataOffset": 512},
                {"path": "tests/test.sh", "size": 32, "offset": 40, "length": 50, "dataOffset": 512}
            ]}"#,
        )
        .unwrap();
        assert_eq!(index.total_size(), 42);
        assert!(serde_json::from_str::<ArchiveIndex>(r#"{"files": [{"path": "a"}]}"#).is_err());
    }
}
