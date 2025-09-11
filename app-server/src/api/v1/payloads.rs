use std::sync::Arc;

use actix_web::{HttpResponse, get, web};
use futures_util::StreamExt;
use serde::Deserialize;

use crate::{
    db::project_api_keys::ProjectApiKey,
    routes::types::ResponseResult,
    storage::{Storage, StorageTrait},
};

#[derive(Deserialize)]
pub struct PayloadQuery {
    #[serde(rename = "payloadType")]
    payload_type: Option<String>,
}

#[get("payloads/{payload_id}")]
pub async fn get_payload(
    path: web::Path<String>,
    query: web::Query<PayloadQuery>,
    storage: web::Data<Arc<Storage>>,
    project_api_key: ProjectApiKey,
) -> ResponseResult {
    let project_id = project_api_key.project_id;
    let payload_id = path.into_inner();
    let query = query.into_inner();

    // Construct the S3 key following the same pattern as the storage module
    let key = format!("project/{}/{}", project_id, payload_id);

    // Get the payload stream from storage
    let Ok(bucket) = std::env::var("S3_TRACE_PAYLOADS_BUCKET") else {
        return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "payloads storage is not configured"
        })));
    };
    let mut stream = match storage.as_ref().get_stream(&bucket, &key).await {
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
            let content_type = get_content_type_from_filename(&payload_id)
                .unwrap_or_else(|| "application/octet-stream".to_string());

            let response = match query.payload_type.as_deref() {
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
        .or_else(|| get_content_type_from_filename(&payload_id))
        .unwrap_or_else(|| "application/octet-stream".to_string());

    // Create a stream that starts with the first chunk and continues with the rest
    let full_stream =
        futures_util::stream::once(async move { Ok::<_, actix_web::Error>(first_chunk) })
            .chain(stream.map(|chunk| Ok::<_, actix_web::Error>(chunk)));

    // Build response with appropriate headers based on payload_type
    let response = match query.payload_type.as_deref() {
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
