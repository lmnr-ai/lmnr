use actix_web::{get, web, HttpResponse};

use crate::{
    db::{self, DB},
    features::{is_feature_enabled, Feature},
    routes::ResponseResult,
};

#[get("stripe_customers/{stripe_customer_id}")]
pub async fn get_user_from_stripe_customer_id(
    path: web::Path<String>,
    db: web::Data<DB>,
) -> ResponseResult {
    if is_feature_enabled(Feature::Subscription) {
        return Ok(HttpResponse::Forbidden().finish());
    }
    let stripe_customer_id = path.into_inner();
    let user = db::user::get_by_stripe_customer_id(&db.pool, &stripe_customer_id).await?;
    Ok(HttpResponse::Ok().json(user))
}
