use actix_service::Service;
use actix_web::{
    middleware::{Logger, NormalizePath},
    web, App, HttpMessage, HttpServer,
};
use actix_web_httpauth::middleware::HttpAuthentication;
use auth::PublicPipelineValidate;
use dashmap::DashMap;
use db::{
    api_keys::ProjectApiKey, limits::RunCountLimitExceeded,
    pipelines::PipelineVersion, user::User,
};
use files::FileManager;
use traces::span_listener;

use cache::{cache::CacheTrait, Cache};
use chunk::{
    character_split::CharacterSplitChunker,
    runner::{Chunker, ChunkerRunner, ChunkerType},
};
use language_model::{LanguageModelProvider, LanguageModelProviderName};
use moka::future::Cache as MokaCache;
use pipeline::trace::log_listener;
use routes::pipelines::GraphInterruptMessage;
use semantic_search::semantic_search_grpc::semantic_search_client::SemanticSearchClient;
use std::{any::TypeId, collections::HashMap, env, sync::Arc};
use tokio::sync::mpsc;
use uuid::Uuid;

mod api;
mod auth;
mod cache;
mod chunk;
mod datasets;
mod db;
mod engine;
mod files;
mod language_model;
mod pipeline;
mod routes;
mod semantic_search;
mod traces;

// ideally this quantity must be dynamically tuned based on the load.
// Higher numbers are good not to slowdown many small requests, but
// if traces are large this can quickly go out of control and take all
// the memory.
const LOG_CHANNEL_SIZE: usize = 1024; // messages
const DEFAULT_CACHE_SIZE: u64 = 100; // entries

#[tokio::main]
async fn main() -> std::io::Result<()> {
    dotenv::dotenv().ok();

    std::env::set_var("RUST_LOG", "info");
    env_logger::init();

    let port = env::var("PORT")
        .unwrap_or(String::from("8000"))
        .parse()
        .unwrap();

    let semantic_search_url =
        env::var("SEMANTIC_SEARCH_URL").expect("SEMANTIC_SEARCH_URL must be set");

    let semantic_search_client = Arc::new(
        SemanticSearchClient::connect(semantic_search_url)
            .await
            .unwrap(),
    );
    let semantic_search = Arc::new(semantic_search::SemanticSearch::new(semantic_search_client));

    let mut caches: HashMap<TypeId, Arc<dyn CacheTrait>> = HashMap::new();
    let auth_cache: Arc<MokaCache<String, User>> = Arc::new(MokaCache::new(DEFAULT_CACHE_SIZE));
    caches.insert(TypeId::of::<User>(), auth_cache);
    let project_api_key_cache: Arc<MokaCache<String, ProjectApiKey>> =
        Arc::new(MokaCache::new(DEFAULT_CACHE_SIZE));
    caches.insert(TypeId::of::<ProjectApiKey>(), project_api_key_cache);
    let pipeline_version_cache: Arc<MokaCache<String, PipelineVersion>> =
        Arc::new(MokaCache::new(DEFAULT_CACHE_SIZE));
    caches.insert(TypeId::of::<PipelineVersion>(), pipeline_version_cache);
    let project_limit_exceeded_cache: Arc<MokaCache<String, RunCountLimitExceeded>> =
        Arc::new(MokaCache::new(DEFAULT_CACHE_SIZE));
    caches.insert(
        TypeId::of::<RunCountLimitExceeded>(),
        project_limit_exceeded_cache,
    );
    let cache = Cache::new(caches);
    let cache = Arc::new(cache);

    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = sqlx::postgres::PgPool::connect(&db_url).await.unwrap();

    let db = Arc::new(db::DB::new(pool));

    let client = reqwest::Client::new();
    let anthropic = language_model::Anthropic::new(client.clone());
    let openai = language_model::OpenAI::new(client.clone());
    let openai_azure = language_model::OpenAIAzure::new(client.clone());
    let gemini = language_model::Gemini::new(client.clone());
    let groq = language_model::Groq::new(client.clone());
    let mistral = language_model::Mistral::new(client.clone());

    let mut language_models: HashMap<LanguageModelProviderName, LanguageModelProvider> =
        HashMap::new();
    language_models.insert(
        LanguageModelProviderName::Anthropic,
        LanguageModelProvider::Anthropic(anthropic),
    );
    language_models.insert(
        LanguageModelProviderName::OpenAI,
        LanguageModelProvider::OpenAI(openai),
    );
    language_models.insert(
        LanguageModelProviderName::OpenAIAzure,
        LanguageModelProvider::OpenAIAzure(openai_azure),
    );
    language_models.insert(
        LanguageModelProviderName::Gemini,
        LanguageModelProvider::Gemini(gemini),
    );
    language_models.insert(
        LanguageModelProviderName::Groq,
        LanguageModelProvider::Groq(groq),
    );
    language_models.insert(
        LanguageModelProviderName::Mistral,
        LanguageModelProvider::Mistral(mistral),
    );
    language_models.insert(
        LanguageModelProviderName::Bedrock,
        LanguageModelProvider::Bedrock(language_model::AnthropicBedrock::new(
            aws_sdk_bedrockruntime::Client::new(
                &aws_config::defaults(aws_config::BehaviorVersion::latest())
                    .region(aws_config::Region::new("us-east-1"))
                    .load()
                    .await,
            ),
        )),
    );

    let language_model_runner = Arc::new(language_model::LanguageModelRunner::new(language_models));

    let document_client = reqwest::Client::new();
    let mut chunkers = HashMap::new();
    let character_split_chunker = CharacterSplitChunker {};
    chunkers.insert(
        ChunkerType::CharacterSplit,
        Chunker::CharacterSplit(character_split_chunker),
    );
    let chunker_runner = Arc::new(ChunkerRunner::new(chunkers));
    let file_manager = Arc::new(FileManager::new(document_client, chunker_runner.clone()));

    let interrupt_senders = Arc::new(DashMap::<Uuid, mpsc::Sender<GraphInterruptMessage>>::new());


    HttpServer::new(move || {
        let auth = HttpAuthentication::bearer(auth::validator);
        let project_auth = HttpAuthentication::bearer(auth::project_validator);

        let (tx, rx) = mpsc::channel(LOG_CHANNEL_SIZE);
        tokio::task::spawn(log_listener(db.clone(), cache.clone(), rx));

        let (observation_tx, observation_rx) = mpsc::channel(LOG_CHANNEL_SIZE);
        tokio::task::spawn(span_listener(
            db.clone(),
            observation_rx,
            language_model_runner.clone(),
        ));

        // tx is cloned to the pipeline runner, so that main keeps another reference
        // to tx, as an additional measure to prevent the channel from being closed.
        // this is done in an attempt to prevent the server from ceasing to write logs
        // after some usage
        let pipeline_runner = Arc::new(pipeline::runner::PipelineRunner::new(
            language_model_runner.clone(),
            chunker_runner.clone(),
            semantic_search.clone(),
            tx.clone(),
        ));

        App::new()
            .wrap(Logger::default())
            .wrap(NormalizePath::trim())
            .app_data(web::Data::from(cache.clone()))
            .app_data(web::Data::from(db.clone()))
            .app_data(web::Data::new(pipeline_runner.clone()))
            .app_data(web::Data::new(file_manager.clone()))
            .app_data(web::Data::new(semantic_search.clone()))
            .app_data(web::Data::new(interrupt_senders.clone()))
            .app_data(web::Data::new(language_model_runner.clone()))
            .app_data(web::Data::new(observation_tx.clone()))
            // Scopes with specific auth or no auth
            .service(web::scope("api/v1/auth").service(routes::auth::signin))
            .service(
                web::scope("/v1")
                    .wrap(project_auth.clone())
                    .service(api::v1::pipelines::run_pipeline_graph)
                    .service(api::v1::pipelines::ping_healthcheck)
                    .service(api::v1::traces::upload_traces)
                    .service(api::v1::traces::get_events_for_session),
            )
            // Scopes with generic auth
            .service(
                web::scope("/api/v1/workspaces")
                    .wrap(auth.clone())
                    .service(routes::workspace::get_all_workspaces_of_user)
                    .service(routes::workspace::get_workspace)
                    .service(routes::workspace::create_workspace)
                    .service(routes::workspace::can_add_users_to_workspace)
                    .service(routes::workspace::add_user_to_workspace),
            )
            .service(
                web::scope("/api/v1/limits")
                    .wrap(auth.clone())
                    .service(routes::limits::get_user_stats)
                    .service(routes::limits::get_workspace_stats)
                    .service(routes::limits::get_user_storage_stats),
            )
            .service(
                web::scope("/api/v1/projects")
                    .wrap(auth)
                    .service(routes::projects::create_project)
                    .service(routes::projects::get_projects)
                    .service(
                        web::scope("/{project_id}")
                            .wrap_fn(|req: actix_web::dev::ServiceRequest, srv| {
                                let project_id =
                                    Uuid::parse_str(req.match_info().get("project_id").unwrap())
                                        .unwrap();
                                let user: User;
                                {
                                    let binding = req.extensions();
                                    // it is safe to unwrap here because if this middle runs user is present in the request
                                    user = binding.get::<User>().cloned().unwrap();
                                }
                                if user.project_ids.as_ref().unwrap().contains(&project_id) {
                                    srv.call(req)
                                } else {
                                    // return unauthorized
                                    log::error!(
                                        "Unauthorized, user {:} is not part of project {}",
                                        user.id,
                                        project_id
                                    );
                                    Box::pin(futures_util::future::err(
                                        actix_web::error::ErrorUnauthorized(""),
                                    ))
                                }
                            })
                            .service(routes::projects::get_project)
                            .service(routes::projects::delete_project)
                            .service(routes::pipelines::run_pipeline_graph)
                            .service(routes::pipelines::get_pipelines)
                            .service(routes::pipelines::create_pipeline)
                            .service(routes::pipelines::update_pipeline)
                            .service(routes::pipelines::get_pipeline_by_id)
                            .service(routes::pipelines::delete_pipeline)
                            .service(routes::pipelines::create_pipeline_version)
                            .service(routes::pipelines::fork_pipeline_version)
                            .service(routes::pipelines::update_pipeline_version)
                            .service(routes::pipelines::overwrite_pipeline_version)
                            .service(routes::pipelines::get_pipeline_versions_info)
                            .service(routes::pipelines::get_pipeline_versions)
                            .service(routes::pipelines::get_pipeline_version)
                            .service(routes::pipelines::get_version)
                            .service(routes::pipelines::get_templates)
                            .service(routes::pipelines::create_template)
                            .service(routes::pipelines::run_pipeline_interrupt_graph)
                            .service(routes::pipelines::update_target_pipeline_version)
                            .service(routes::trace_analytics::get_endpoint_trace_analytics)
                            .service(routes::trace_analytics::get_project_trace_analytics)
                            .service(routes::trace_tags::get_tag_types)
                            .service(routes::trace_tags::create_tag_type)
                            .service(routes::trace_tags::update_trace_tag)
                            .service(routes::trace_tags::get_trace_tags)
                            .service(routes::api_keys::create_project_api_key)
                            .service(routes::api_keys::get_api_keys_for_project)
                            .service(routes::api_keys::revoke_project_api_key)
                            .service(routes::datasets::get_datasets)
                            .service(routes::datasets::create_dataset)
                            .service(routes::datasets::get_dataset)
                            .service(routes::datasets::rename_dataset)
                            .service(routes::datasets::delete_dataset)
                            .service(routes::datasets::upload_datapoint_file)
                            .service(routes::datasets::create_datapoints)
                            .service(routes::datasets::get_datapoints)
                            .service(routes::datasets::update_datapoint_data)
                            .service(routes::datasets::delete_datapoints)
                            .service(routes::datasets::delete_all_datapoints)
                            .service(routes::datasets::index_dataset)
                            .service(routes::traces::get_traces)
                            .service(routes::traces::get_single_trace)
                            .service(routes::traces::get_single_span)
                            .service(routes::events::get_event_templates)
                            .service(routes::events::create_event_template)
                            .service(routes::events::get_event_template)
                            .service(routes::events::update_event_template)
                            .service(routes::events::delete_event_template)
                            .service(routes::events::get_events_by_template_id)
                            .service(routes::events::get_events_metrics)
                            .service(routes::metrics::get_traces_metrics),
                    ),
            )
            .service(
                web::scope("/api/v1/public/pipelines")
                    .service(routes::pipelines::get_public_pipeline_by_id)
                    .service(
                        web::scope("/{pipeline_id}")
                            .wrap(PublicPipelineValidate)
                            .service(routes::pipelines::get_public_pipeline_version)
                            .service(routes::pipelines::get_public_pipeline_versions_info),
                    ),
            )
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
