use actix_service::Service;
use actix_web::{
    middleware::{Logger, NormalizePath},
    web::{self, PayloadConfig},
    App, HttpMessage, HttpServer,
};
use actix_web_httpauth::middleware::HttpAuthentication;
use dashmap::DashMap;
use db::{api_keys::ProjectApiKey, pipelines::PipelineVersion, user::User};
use files::FileManager;
use traces::{observation_collector, OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE};

use cache::{cache::CacheTrait, Cache};
use chunk::{
    character_split::CharacterSplitChunker,
    runner::{Chunker, ChunkerRunner, ChunkerType},
};
use language_model::{LanguageModelProvider, LanguageModelProviderName};
use lapin::{
    options::{ExchangeDeclareOptions, QueueDeclareOptions},
    types::FieldTable,
    Connection, ConnectionProperties,
};
use moka::future::Cache as MokaCache;
use routes::pipelines::GraphInterruptMessage;
use semantic_search::semantic_search_grpc::semantic_search_client::SemanticSearchClient;
use std::{any::TypeId, collections::HashMap, env, sync::Arc};
use tokio::sync::mpsc;
use uuid::Uuid;

mod api;
mod auth;
mod cache;
mod ch;
mod chunk;
mod datasets;
mod db;
mod engine;
mod files;
mod language_model;
mod opentelemetry;
mod pipeline;
mod routes;
mod semantic_search;
mod traces;

const DEFAULT_CACHE_SIZE: u64 = 100; // entries

#[tokio::main]
async fn main() -> std::io::Result<()> {
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

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

    let rabbitmq_url = env::var("RABBITMQ_URL").expect("RABBITMQ_URL must be set");
    let rabbitmq_connection = Arc::new(
        Connection::connect(&rabbitmq_url, ConnectionProperties::default())
            .await
            .unwrap(),
    );

    let clickhouse_url = env::var("CLICKHOUSE_URL").expect("CLICKHOUSE_URL must be set");
    let clickhouse_user = env::var("CLICKHOUSE_USER").expect("CLICKHOUSE_USER must be set");
    let clickhouse_password = env::var("CLICKHOUSE_PASSWORD");
    // https://clickhouse.com/docs/en/cloud/bestpractices/asynchronous-inserts -> Create client which will wait for async inserts
    // For now, we're not waiting for inserts to finish, but later need to add queue and batch on client-side
    let mut clickhouse = clickhouse::Client::default()
        .with_url(clickhouse_url)
        .with_user(clickhouse_user)
        .with_database("default")
        .with_option("async_insert", "1")
        .with_option("wait_for_async_insert", "0");
    if let Ok(clickhouse_password) = clickhouse_password {
        clickhouse = clickhouse.with_password(clickhouse_password);
    } else {
        log::warn!("CLICKHOUSE_PASSWORD not set, using without password");
    }

    // declare the exchange
    let channel = rabbitmq_connection.create_channel().await.unwrap();
    channel
        .exchange_declare(
            OBSERVATIONS_EXCHANGE,
            lapin::ExchangeKind::Fanout,
            ExchangeDeclareOptions::default(),
            FieldTable::default(),
        )
        .await
        .unwrap();

    channel
        .queue_declare(
            OBSERVATIONS_QUEUE,
            QueueDeclareOptions::default(),
            FieldTable::default(),
        )
        .await
        .unwrap();

    HttpServer::new(move || {
        let auth = HttpAuthentication::bearer(auth::validator);
        let project_auth = HttpAuthentication::bearer(auth::project_validator);
        let shared_secret_auth = HttpAuthentication::bearer(auth::shared_secret_validator);

        let pipeline_runner = Arc::new(pipeline::runner::PipelineRunner::new(
            language_model_runner.clone(),
            chunker_runner.clone(),
            semantic_search.clone(),
            rabbitmq_connection.clone(),
        ));

        tokio::task::spawn(observation_collector(
            pipeline_runner.clone(),
            db.clone(),
            cache.clone(),
            language_model_runner.clone(),
            rabbitmq_connection.clone(),
            clickhouse.clone(),
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
            .app_data(web::Data::new(rabbitmq_connection.clone()))
            .app_data(web::Data::new(clickhouse.clone()))
            // Scopes with specific auth or no auth
            .service(
                web::scope("api/v1/auth")
                    .wrap(shared_secret_auth)
                    .service(routes::auth::signin),
            )
            .service(
                web::scope("/v1")
                    .wrap(project_auth.clone())
                    .service(api::v1::pipelines::run_pipeline_graph)
                    .service(api::v1::pipelines::ping_healthcheck)
                    .service(api::v1::traces::get_events_for_session)
                    .service(api::v1::evaluations::create_evaluation)
                    .service(api::v1::evaluations::upload_evaluation_datapoints)
                    .service(api::v1::evaluations::update_evaluation)
                    .service(api::v1::traces::process_traces)
                    .service(api::v1::metrics::process_metrics)
                    .app_data(PayloadConfig::new(10 * 1024 * 1024)),
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
                            .service(routes::api_keys::create_project_api_key)
                            .service(routes::api_keys::get_api_keys_for_project)
                            .service(routes::api_keys::revoke_project_api_key)
                            .service(routes::evaluations::get_evaluation)
                            .service(routes::evaluations::delete_evaluation)
                            .service(routes::evaluations::get_evaluation_datapoint)
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
                            .service(routes::evaluations::get_evaluations)
                            .service(routes::evaluations::get_finished_evaluation_infos)
                            .service(routes::evaluations::get_evaluation)
                            .service(routes::evaluations::get_evaluation_datapoint)
                            .service(routes::traces::get_traces)
                            .service(routes::traces::get_single_trace)
                            .service(routes::traces::get_single_span)
                            .service(routes::events::get_event_templates)
                            .service(routes::events::get_event_template)
                            .service(routes::events::update_event_template)
                            .service(routes::events::delete_event_template)
                            .service(routes::events::get_events_by_template_id)
                            .service(routes::events::get_events_metrics)
                            .service(routes::events::get_events)
                            .service(routes::traces::get_traces_metrics),
                    ),
            )
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
