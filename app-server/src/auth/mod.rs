use anyhow::Result;
use std::future::{ready, Ready};

use actix_web::dev::Payload;
use actix_web::dev::ServiceRequest;
use actix_web::web;
use actix_web::Error;
use actix_web::{FromRequest, HttpMessage, HttpRequest};
use actix_web_httpauth::extractors::bearer::{BearerAuth, Config};
use actix_web_httpauth::extractors::AuthenticationError;

use crate::api::utils::get_api_key_from_raw_value;
use crate::cache::Cache;
use crate::db::project_api_keys::ProjectApiKey;
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
            Some(key) => return ready(Ok(key)),
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

    match validate_token(&db, credentials.token().to_string()).await {
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

async fn validate_token(db: &DB, token: String) -> Result<User> {
    get_user_from_api_key(&db.pool, token).await
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

    match get_api_key_from_raw_value(&db.pool, cache, credentials.token().to_string()).await {
        Ok(api_key) => {
            req.extensions_mut()
                .insert(api_key.into_with_raw(credentials.token().to_string()));
            Ok(req)
        }
        Err(e) => {
            log::error!("Error validating project_token: {}", e);
            Err((AuthenticationError::from(config).into(), req))
        }
    }
}
