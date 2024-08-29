use anyhow::Result;
use std::future::{ready, Ready};
use std::sync::Arc;
use uuid::Uuid;

use actix_web::dev::Payload;
use actix_web::dev::ServiceRequest;
use actix_web::web;
use actix_web::{
    dev::{forward_ready, Service, ServiceResponse, Transform},
    Error,
};
use actix_web::{FromRequest, HttpMessage, HttpRequest};
use actix_web_httpauth::extractors::bearer::{BearerAuth, Config};
use actix_web_httpauth::extractors::AuthenticationError;
use futures_util::future::LocalBoxFuture;

use crate::cache::Cache;
use crate::db::api_keys::{get_api_key, ProjectApiKey};
use crate::db::pipelines::get_pipeline_by_id;
use crate::db::user::{get_user_from_api_key, User};
use crate::db::DB;

impl FromRequest for User {
    type Error = Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        match req.extensions().get::<User>().cloned() {
            Some(user) => return ready(Ok(user)),
            None => return ready(Err(actix_web::error::ParseError::Incomplete.into())),
        };
    }
}

impl FromRequest for ProjectApiKey {
    type Error = Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        match req.extensions().get::<Self>().cloned() {
            Some(user) => return ready(Ok(user)),
            None => return ready(Err(actix_web::error::ParseError::Incomplete.into())),
        };
    }
}

pub async fn validator(
    req: ServiceRequest,
    credentials: BearerAuth,
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

    match validate_token(&db, cache.clone(), credentials.token().to_string()).await {
        Ok(user) => {
            req.extensions_mut().insert(user);
            Ok(req)
        }
        Err(e) => {
            log::error!("Error validating token: {}", e);
            Err((AuthenticationError::from(config).into(), req))
        }
    }
}

async fn validate_token(db: &DB, cache: Arc<Cache>, token: String) -> Result<User> {
    get_user_from_api_key(&db.pool, token, cache).await
}

pub async fn project_validator(
    req: ServiceRequest,
    credentials: BearerAuth,
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

    match get_api_key(&db.pool, &credentials.token().to_string(), cache.clone()).await {
        Ok(api_key) => {
            req.extensions_mut().insert(api_key);
            Ok(req)
        }
        Err(e) => {
            log::error!("Error validating project_token: {}", e);
            Err((AuthenticationError::from(config).into(), req))
        }
    }
}

pub struct PublicPipelineValidate;

impl<S, B> Transform<S, ServiceRequest> for PublicPipelineValidate
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = PublicPipelineValidateMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(PublicPipelineValidateMiddleware { service }))
    }
}

pub struct PublicPipelineValidateMiddleware<S> {
    service: S,
}

impl<S, B> Service<ServiceRequest> for PublicPipelineValidateMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let db = req
            .app_data::<web::Data<DB>>()
            .cloned()
            .unwrap()
            .into_inner();

        let pipeline_id = Uuid::parse_str(req.match_info().get("pipeline_id").unwrap()).unwrap();
        let fut = self.service.call(req);

        Box::pin(async move {
            let pipeline = get_pipeline_by_id(&db.pool, &pipeline_id).await;
            match pipeline {
                Ok(pipeline) => {
                    if pipeline.visibility == "PUBLIC" {
                        Ok(fut.await?)
                    } else {
                        Err(actix_web::error::ErrorUnauthorized("Unauthorized"))
                    }
                }
                Err(_) => Err(actix_web::error::ErrorNotFound("Pipeline not found")),
            }
        })
    }
}
