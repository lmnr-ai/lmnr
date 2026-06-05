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
use crate::db::project_api_keys::ProjectAuth;

pub mod jwks;
pub mod jwt;

impl FromRequest for ProjectAuth {
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
        Ok(auth) => {
            // Check if ingest-only keys are allowed for this endpoint
            if !allow_ingest_only && auth.is_ingest_only {
                log::warn!(
                    "Ingest-only API key attempted to access restricted endpoint: project_id={}",
                    auth.project_id
                );
                // Return a blank 404 to match default actix web behavior
                let response = actix_web::HttpResponse::NotFound().finish();
                return Err((
                    actix_web::error::InternalError::from_response("", response).into(),
                    req,
                ));
            }
            req.extensions_mut().insert(auth);
            Ok(req)
        }
        Err(e) => {
            log::error!("Error validating project_token: {}", e);
            Err((AuthenticationError::from(config).into(), req))
        }
    }
}

/// Standard project validator - blocks ingest-only keys.
/// Kept alongside `project_validator_with_jwt` for callers that want the
/// API-key-only path (today none; both production wrappings switched to the
/// JWT-aware variant in `main.rs`).
#[allow(dead_code)]
pub async fn project_validator(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    validate_project_api_key(req, credentials, false).await
}

/// Ingestion validator - allows ingest-only keys for trace ingestion endpoints.
#[allow(dead_code)]
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
) -> anyhow::Result<ProjectAuth> {
    let token = extract_bearer_token(metadata)?;
    get_api_key_from_raw_value(pool, cache, token).await
}

/// JWT-aware variant of `authenticate_request` for gRPC ingestion. Bearer
/// tokens that look like JWTs (3 segments + decodable header) are validated
/// against the JWKS read directly from Postgres; everything else falls
/// through to the existing API-key path.
pub async fn authenticate_request_with_jwt(
    metadata: &tonic::metadata::MetadataMap,
    pool: &PgPool,
    cache: Arc<Cache>,
) -> anyhow::Result<ProjectAuth> {
    let token = extract_bearer_token(metadata)?;
    if jwt::looks_like_jwt(&token) {
        return jwt::validate_jwt(pool, &token).await;
    }
    get_api_key_from_raw_value(pool, cache, token).await
}

async fn validate_via_jwt(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    let config = req
        .app_data::<Config>()
        .cloned()
        .unwrap_or_else(Default::default);

    let db = match req.app_data::<web::Data<DB>>().cloned() {
        Some(d) => d.into_inner(),
        None => {
            log::error!("DB not in app_data — JWT validation cannot proceed");
            return Err((AuthenticationError::from(config).into(), req));
        }
    };

    match jwt::validate_jwt(&db.pool, credentials.token()).await {
        Ok(auth) => {
            req.extensions_mut().insert(auth);
            Ok(req)
        }
        Err(e) => {
            log::warn!("JWT validation failed: {}", e);
            Err((AuthenticationError::from(config).into(), req))
        }
    }
}

/// Same as `project_validator` but accepts both API keys and OAuth JWTs.
pub async fn project_validator_with_jwt(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    if jwt::looks_like_jwt(credentials.token()) {
        return validate_via_jwt(req, credentials).await;
    }
    validate_project_api_key(req, credentials, false).await
}

/// Same as `project_ingestion_validator` but accepts both API keys and OAuth JWTs.
pub async fn project_ingestion_validator_with_jwt(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    if jwt::looks_like_jwt(credentials.token()) {
        return validate_via_jwt(req, credentials).await;
    }
    validate_project_api_key(req, credentials, true).await
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
