use anyhow::Result;
use sqlx::PgPool;
use std::future::{Ready, ready};
use std::sync::Arc;

use actix_web::Error;
use actix_web::dev::Payload;
use actix_web::dev::ServiceRequest;
use actix_web::web;
use actix_web::{FromRequest, HttpMessage, HttpRequest};
use actix_web_httpauth::extractors::AuthenticationError;
use actix_web_httpauth::extractors::bearer::{BearerAuth, Config};
use tonic::Status;

use crate::api::utils::get_api_key_from_raw_value;
use crate::cache::Cache;
use crate::db::DB;
use crate::db::project_api_keys::ProjectApiKey;

impl FromRequest for ProjectApiKey {
    type Error = Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        match req.extensions().get::<Self>().cloned() {
            Some(key) => return ready(Ok(key)),
            None => return ready(Err(actix_web::error::ParseError::Incomplete.into())),
        };
    }
}

async fn validate_project_api_key(
    req: ServiceRequest,
    credentials: BearerAuth,
    allow_ingest_only: bool,
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    let config = req
        .app_data::<Config>()
        .map(|data| data.clone())
        .unwrap_or_else(Default::default);

    let db = req
        .app_data::<web::Data<DB>>()
        .cloned()
        .unwrap()
        .into_inner();
    let cache = req
        .app_data::<web::Data<Cache>>()
        .cloned()
        .unwrap()
        .into_inner();

    match get_api_key_from_raw_value(&db.pool, cache, credentials.token().to_string()).await {
        Ok(api_key) => {
            // Check if ingest-only keys are allowed for this endpoint
            if !allow_ingest_only && api_key.is_ingest_only {
                log::warn!(
                    "Ingest-only API key attempted to access restricted endpoint: project_id={}",
                    api_key.project_id
                );
                // Return a blank 404 to match default actix web behavior
                let response = actix_web::HttpResponse::NotFound().finish();
                return Err((
                    actix_web::error::InternalError::from_response("", response).into(),
                    req,
                ));
            }
            req.extensions_mut().insert(api_key);
            Ok(req)
        }
        Err(e) => {
            log::error!("Error validating project_token: {}", e);
            Err((AuthenticationError::from(config).into(), req))
        }
    }
}

/// Standard project validator - blocks ingest-only keys
pub async fn project_validator(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    validate_project_api_key(req, credentials, false).await
}

/// Ingestion validator - allows ingest-only keys for trace ingestion endpoints
pub async fn project_ingestion_validator(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    validate_project_api_key(req, credentials, true).await
}

/// Authenticates gRPC trace ingestion requests.
/// Note: This endpoint accepts both default and ingest-only API keys,
/// as it's used for writing trace data to the project.
pub async fn authenticate_request(
    metadata: &tonic::metadata::MetadataMap,
    pool: &PgPool,
    cache: Arc<Cache>,
) -> anyhow::Result<ProjectApiKey> {
    let token = extract_bearer_token(metadata)?;
    get_api_key_from_raw_value(pool, cache, token).await
}

fn extract_bearer_token(metadata: &tonic::metadata::MetadataMap) -> anyhow::Result<String> {
    // Default OpenTelemetry gRPC exporter uses `"authorization"` with lowercase `a`,
    // but users may use `"Authorization"` with uppercase `A` in custom exporters.
    let header = metadata
        .get("authorization")
        .or(metadata.get("Authorization"));
    if let Some(auth_header) = header {
        let auth_str = auth_header
            .to_str()
            .map_err(|_| Status::unauthenticated("Invalid token"))?;
        if auth_str.starts_with("Bearer ") {
            return Ok(auth_str.trim_start_matches("Bearer ").to_string());
        }
    }
    Err(anyhow::anyhow!("No bearer token found"))
}
