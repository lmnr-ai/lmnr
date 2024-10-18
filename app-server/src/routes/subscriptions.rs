//! The flow of the subscriptions is as follows:
//! 1. The user clicks 'Subscribe' on the frontend
//! 1. We create a stripe customer by calling stripe.customers.create with an email associated with the user.
//!     - This returns a stripeCustomerId
//! 1. Front-end sends a POST request to /api/v1/subscriptions with the stripeCustomerId.
//!    - We save the stripeCustomerId in `user_subscription_info` table.
//! 1. Once the subscription is activated, stripe sends a webhook to our front-end,
//! which in turn sends a POST request to /api/v1/manage-subscription.
//! 1. We turn the `activated` flag to true in the `user_subscription_info` table.
//! 1. We get the `tier_id` from the `subscription_tiers` table using the `product_id` from the request.
//! 1. We update the corresponding workspace according to the data.
//!
//! When the user wants to manage their billing at stripe, we check the `user_subscription_info` table for:
//! - `stripe_customer_id`
//! - `activated` flag
//!
//! If both are present/true, the front-end should redirect the user to the stripe billing portal.
//! Otherwise, it triggers the checkout flow optionally creating a new stripe customer.

use actix_web::{get, post, web, HttpResponse};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    db::{self, user::User},
    features::{is_feature_enabled, Feature},
    routes::ResponseResult,
    traces::limits::update_workspace_limit_exceeded_by_workspace_id,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubscriptionRequest {
    pub stripe_customer_id: String,
}

#[post("")] // POST /api/v1/subscriptions
pub async fn save_stripe_customer_id(
    db: web::Data<db::DB>,
    request: web::Json<SubscriptionRequest>,
    user: User,
) -> ResponseResult {
    if !is_feature_enabled(Feature::Storage) {
        return Ok(HttpResponse::Forbidden().finish());
    }
    db::subscriptions::save_stripe_customer_id(&db.pool, &user.id, &request.stripe_customer_id)
        .await?;

    Ok(HttpResponse::Ok().finish())
}

#[get("")] // GET /api/v1/subscriptions
pub async fn get_user_subscription_info(db: web::Data<db::DB>, user: User) -> ResponseResult {
    if !is_feature_enabled(Feature::Storage) {
        return Ok(HttpResponse::Forbidden().finish());
    }
    let stripe_customer_id =
        db::subscriptions::get_user_subscription_info(&db.pool, &user.id).await?;

    Ok(HttpResponse::Ok().json(stripe_customer_id))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManageSubscriptionRequest {
    pub stripe_customer_id: String,
    pub product_id: String,
    pub workspace_id: Uuid,
    #[serde(default)]
    pub is_additional_seats: bool,
    #[serde(default)]
    pub quantity: Option<i64>,
    #[serde(default)]
    pub cancel: bool,
}

#[post("")] // POST /api/v1/manage-subscription
pub async fn update_subscription(
    db: web::Data<db::DB>,
    cache: web::Data<crate::cache::Cache>,
    request: web::Json<ManageSubscriptionRequest>,
) -> ResponseResult {
    if !is_feature_enabled(Feature::Storage) {
        return Ok(HttpResponse::Forbidden().finish());
    }
    let db = db.into_inner();
    let cache = cache.into_inner();
    let request = request.into_inner();
    let workspace_id = request.workspace_id;
    let stripe_customer_id = request.stripe_customer_id;
    let is_additional_seats = request.is_additional_seats;
    let quantity = request.quantity.unwrap_or_default();

    db::subscriptions::activate_stripe_customer(&db.pool, &stripe_customer_id).await?;

    if is_additional_seats && quantity > 0 {
        db::subscriptions::add_seats(&db.pool, &workspace_id, quantity).await?;
        return Ok(HttpResponse::Ok().finish());
    }

    let is_upgrade_from_free = db::subscriptions::update_subscription(
        &db.pool,
        &workspace_id,
        &request.product_id,
        request.cancel,
    )
    .await?;

    if is_upgrade_from_free {
        tokio::spawn(async move {
            let _ = db::subscriptions::reset_workspace_usage(db.clone(), workspace_id).await;
            let _ = update_workspace_limit_exceeded_by_workspace_id(
                db.clone(),
                cache.clone(),
                workspace_id,
            )
            .await;
        });
    };

    Ok(HttpResponse::Ok().finish())
}
