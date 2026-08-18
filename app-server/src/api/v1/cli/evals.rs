use actix_web::{delete, get, post, web};
use uuid::Uuid;

use crate::{
    api::v1::evals::{
        EvalTagsRequest, ListEvalsQuery, add_eval_tags_response, get_eval_response,
        list_evals_response, remove_eval_tag_response,
    },
    auth::cli_user::CliProjectAuth,
    db::DB,
    routes::types::ResponseResult,
};

// CLI user-token twins of the `/v1/evals` read + tag handlers. Thin: same request
// types and the same shared bodies as the project-API-key handlers; only the auth
// extractor (`CliProjectAuth`) differs.

/// `GET /v1/cli/evals`
#[get("/evals")]
pub async fn list_evals(
    auth: CliProjectAuth,
    query: web::Query<ListEvalsQuery>,
    db: web::Data<DB>,
) -> ResponseResult {
    list_evals_response(&db.pool, auth.project_id, query.into_inner()).await
}

/// `GET /v1/cli/evals/{eval_id}`
#[get("/evals/{eval_id}")]
pub async fn get_eval(
    auth: CliProjectAuth,
    eval_id: web::Path<Uuid>,
    db: web::Data<DB>,
) -> ResponseResult {
    get_eval_response(&db.pool, auth.project_id, eval_id.into_inner()).await
}

/// `POST /v1/cli/evals/{eval_id}/tags`
#[post("/evals/{eval_id}/tags")]
pub async fn add_eval_tags(
    auth: CliProjectAuth,
    eval_id: web::Path<Uuid>,
    req: web::Json<EvalTagsRequest>,
    db: web::Data<DB>,
) -> ResponseResult {
    add_eval_tags_response(
        &db.pool,
        auth.project_id,
        eval_id.into_inner(),
        req.into_inner(),
    )
    .await
}

/// `DELETE /v1/cli/evals/{eval_id}/tags/{tag}`
#[delete("/evals/{eval_id}/tags/{tag}")]
pub async fn remove_eval_tag(
    auth: CliProjectAuth,
    path: web::Path<(Uuid, String)>,
    db: web::Data<DB>,
) -> ResponseResult {
    let (eval_id, tag) = path.into_inner();
    remove_eval_tag_response(&db.pool, auth.project_id, eval_id, &tag).await
}
