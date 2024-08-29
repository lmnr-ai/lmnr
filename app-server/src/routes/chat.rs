use std::sync::Arc;

use actix_web::{get, post, web, HttpResponse, Responder};
use log::error;
use serde::{Deserialize, Serialize};

use crate::{
    agent::Agent,
    db::{self, DB},
    language_model::{ChatMessage, LanguageModel},
    semantic_search::SemanticSearch,
};

#[derive(Debug, Serialize, Deserialize)]
struct ChatParams {
    message: ChatMessage,
    chat_id: String,
}

#[post("/api/v1/chat/completion")]
async fn chat_completion(
    params: web::Json<ChatParams>,
    user: db::user::User,
    semantic_search: web::Data<SemanticSearch>,
    db: web::Data<DB>,
    language_model: web::Data<LanguageModel>,
    agent: web::Data<Agent>,
) -> impl Responder {
    let params = params.into_inner();

    HttpResponse::Ok()
    // match agent
    //     .as_ref()
    //     .chat_completion_stream_with_context(
    //         user.id,
    //         params.chat_id,
    //         params.message,
    //         semantic_search.as_ref(),
    //         db.as_ref(),
    //         language_model.as_ref(),
    //     )
    //     .await
    // {
    //     Ok(stream) => HttpResponse::Ok().streaming(stream),
    //     Err(e) => {
    //         error!("Error returning stream, {}", e);
    //         HttpResponse::InternalServerError().finish()
    //     }
    // }
}
