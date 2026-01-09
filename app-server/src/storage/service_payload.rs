//! Payload handling for StorageService.

use actix_web::HttpResponse;
use anyhow::Result;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use crate::mq::MessageQueueTrait;
use crate::routes::types::ResponseResult;

use super::{PAYLOADS_EXCHANGE, PAYLOADS_ROUTING_KEY, StorageService};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueuePayloadMessage {
    pub key: String,
    pub data: Vec<u8>,
    pub bucket: String,
}

/// Convert a storage key to a URL.
/// Key format: "project/{project_id}/{payload_id}[.ext]"
fn key_to_url(key: &str) -> String {
    let parts = key
        .strip_prefix("project/")
        .unwrap()
        .split("/")
        .collect::<Vec<&str>>();
    format!("/api/projects/{}/payloads/{}", parts[0], parts[1])
}

fn infer_content_type_from_bytes(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 4 {
        return None;
    }

    // Convert first few bytes to hex for magic number detection
    let hex = bytes
        .iter()
        .take(12)
        .map(|b| format!("{:02x}", b))
        .collect::<String>();

    // Check magic numbers for common file types (matching TypeScript version)
    if hex.starts_with("89504e47") {
        Some("image/png".to_string()) // PNG: 89 50 4E 47
    } else if hex.starts_with("ffd8ff") {
        Some("image/jpeg".to_string()) // JPEG: FF D8 FF
    } else if hex.starts_with("47494638") {
        Some("image/gif".to_string()) // GIF: 47 49 46 38
    } else if hex.starts_with("52494646") && hex.len() >= 24 && &hex[16..24] == "57454250" {
        Some("image/webp".to_string()) // WEBP: RIFF...WEBP
    } else if hex.starts_with("25504446") {
        Some("application/pdf".to_string()) // PDF: 25 50 44 46
    } else {
        None
    }
}

fn get_content_type_from_filename(filename: &str) -> Option<String> {
    if filename.ends_with(".png") {
        Some("image/png".to_string())
    } else if filename.ends_with(".gif") {
        Some("image/gif".to_string())
    } else if filename.ends_with(".webp") {
        Some("image/webp".to_string())
    } else if filename.ends_with(".pdf") {
        Some("application/pdf".to_string())
    } else if filename.ends_with(".jpg") || filename.ends_with(".jpeg") {
        Some("image/jpeg".to_string())
    } else {
        Some("application/octet-stream".to_string()) // safe default like TypeScript
    }
}

impl StorageService {
    /// Publish a payload to the queue for async storage.
    /// Returns the URL that will be available after the payload is stored.
    #[instrument(skip(self, data))]
    pub async fn publish_payload(&self, bucket: &str, key: &str, data: Vec<u8>) -> Result<String> {
        let message = QueuePayloadMessage {
            key: key.to_string(),
            data,
            bucket: bucket.to_string(),
        };

        self.queue
            .publish(
                &serde_json::to_vec(&message)?,
                PAYLOADS_EXCHANGE,
                PAYLOADS_ROUTING_KEY,
            )
            .await?;

        Ok(key_to_url(key))
    }

    /// Fetch a payload from storage.
    pub async fn get_payload_response(
        &self,
        project_id: Uuid,
        payload_id: &str,
        payload_type: Option<&str>,
    ) -> ResponseResult {
        // Construct the S3 key
        let key = format!("project/{}/{}", project_id, payload_id);

        // Get the payload stream from storage
        let Ok(bucket) = std::env::var("S3_TRACE_PAYLOADS_BUCKET") else {
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "payloads storage is not configured"
            })));
        };
        let mut stream = match self.get_stream(project_id, &bucket, &key).await {
            Ok(stream) => stream,
            Err(e) => {
                log::error!("Failed to retrieve payload from storage: {:?}", e);
                return Ok(HttpResponse::NotFound().json(serde_json::json!({
                    "error": "Payload not found"
                })));
            }
        };

        // Peek at the first chunk to determine content type
        let first_chunk = match stream.next().await {
            Some(chunk) => chunk,
            None => {
                // Empty stream
                let content_type = get_content_type_from_filename(payload_id)
                    .unwrap_or_else(|| "application/octet-stream".to_string());

                let response = match payload_type {
                    Some("image") => HttpResponse::Ok()
                        .content_type(content_type)
                        .insert_header(("Content-Disposition", "inline"))
                        .streaming(futures_util::stream::empty::<
                            Result<bytes::Bytes, actix_web::Error>,
                        >()),
                    Some("raw") => HttpResponse::Ok().content_type(content_type).streaming(
                        futures_util::stream::empty::<Result<bytes::Bytes, actix_web::Error>>(),
                    ),
                    _ => {
                        let filename_header = format!("attachment; filename=\"{}\"", payload_id);
                        HttpResponse::Ok()
                            .content_type(content_type)
                            .insert_header(("Content-Disposition", filename_header))
                            .streaming(futures_util::stream::empty::<
                                Result<bytes::Bytes, actix_web::Error>,
                            >())
                    }
                };
                return Ok(response);
            }
        };

        // Determine content type from first chunk and filename
        let content_type = infer_content_type_from_bytes(&first_chunk)
            .or_else(|| get_content_type_from_filename(payload_id))
            .unwrap_or_else(|| "application/octet-stream".to_string());

        // Create a stream that starts with the first chunk and continues with the rest
        let full_stream =
            futures_util::stream::once(async move { Ok::<_, actix_web::Error>(first_chunk) })
                .chain(stream.map(|chunk| Ok::<_, actix_web::Error>(chunk)));

        // Build response with appropriate headers based on payload_type
        let response = match payload_type {
            Some("image") => HttpResponse::Ok()
                .content_type(content_type)
                .insert_header(("Content-Disposition", "inline"))
                .streaming(full_stream),
            Some("raw") => HttpResponse::Ok()
                .content_type(content_type)
                .streaming(full_stream),
            _ => {
                // Default behavior - attachment with filename
                let filename_header = format!("attachment; filename=\"{}\"", payload_id);
                HttpResponse::Ok()
                    .content_type(content_type)
                    .insert_header(("Content-Disposition", filename_header))
                    .streaming(full_stream)
            }
        };

        Ok(response)
    }
}
