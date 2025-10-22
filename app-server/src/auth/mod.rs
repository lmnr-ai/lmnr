use anyhow::Result;
use std::future::{Ready, ready};

use actix_web::Error;
use actix_web::dev::Payload;
use actix_web::dev::ServiceRequest;
use actix_web::web;
use actix_web::{FromRequest, HttpMessage, HttpRequest};
use actix_web_httpauth::extractors::AuthenticationError;
use actix_web_httpauth::extractors::bearer::{BearerAuth, Config};

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
