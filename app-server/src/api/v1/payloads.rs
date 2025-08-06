use std::sync::Arc;

use actix_web::{HttpResponse, get, web};
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

    // Get the payload data from storage
    let bytes = match storage.as_ref().get(&key, &None).await {
        Ok(bytes) => bytes,
        Err(e) => {
            log::error!("Failed to retrieve payload from storage: {:?}", e);
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Payload not found"
            })));
        }
    };

    // Determine content type - first try to infer from bytes, then from filename
    let content_type = infer_content_type_from_bytes(&bytes)
        .or_else(|| get_content_type_from_filename(&payload_id))
        .unwrap_or_else(|| "application/octet-stream".to_string());

    // Build response with appropriate headers based on payload_type
    let response = match query.payload_type.as_deref() {
        Some("image") => HttpResponse::Ok()
            .content_type(content_type)
            .insert_header(("Content-Disposition", "inline"))
            .body(bytes),
        Some("raw") => HttpResponse::Ok().content_type(content_type).body(bytes),
        _ => {
            // Default behavior - attachment with filename
            let filename_header = format!("attachment; filename=\"{}\"", payload_id);
            HttpResponse::Ok()
                .content_type(content_type)
                .insert_header(("Content-Disposition", filename_header))
                .body(bytes)
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
