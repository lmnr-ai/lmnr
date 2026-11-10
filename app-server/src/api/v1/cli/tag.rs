use actix_web::{
    post,
    web::{self, Json},
};

use crate::{
    api::v1::tag::{TagRequest, handle_tag_trace},
    auth::cli_user::CliProjectAuth,
    routes::types::ResponseResult,
};

/// `POST /v1/cli/tag` — CLI twin of `/v1/tag`. Delegates to the shared
/// `handle_tag_trace`; differs only in auth (`CliProjectAuth` user token vs
/// project API key). Like `/v1/tag` and UI tagging, not audited.
#[post("")]
pub async fn tag_trace(
    auth: CliProjectAuth,
    req: Json<TagRequest>,
    clickhouse: web::Data<clickhouse::Client>,
) -> ResponseResult {
    handle_tag_trace(auth.project_id, req, clickhouse).await
}
