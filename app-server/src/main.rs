use actix_service::Service;
use actix_web::{
    middleware::{Logger, NormalizePath},
    web::{self, JsonConfig, PayloadConfig},
    App, HttpMessage, HttpServer,
};
use actix_web_httpauth::middleware::HttpAuthentication;
use aws_config::BehaviorVersion;
use code_executor::{code_executor_grpc::code_executor_client::CodeExecutorClient, CodeExecutor};
use dashmap::DashMap;
use db::{pipelines::PipelineVersion, project_api_keys::ProjectApiKey, user::User};
use features::{is_feature_enabled, Feature};
use machine_manager::{
    machine_manager_service_client::MachineManagerServiceClient, MachineManager, MachineManagerImpl,
};
use names::NameGenerator;
use opentelemetry::opentelemetry::proto::collector::trace::v1::trace_service_server::TraceServiceServer;
use projects::Project;
use runtime::{create_general_purpose_runtime, wait_stop_signal};
use storage::{mock::MockStorage, Storage};
use tonic::transport::Server;
use traces::{
    consumer::process_queue_spans, grpc_service::ProcessTracesService,
    limits::WorkspaceLimitsExceeded, OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE,
};

use cache::{cache::CacheTrait, Cache};
use chunk::{
    character_split::CharacterSplitChunker,
    runner::{Chunker, ChunkerRunner, ChunkerType},
};
use language_model::{costs::LLMPriceEntry, LanguageModelProvider, LanguageModelProviderName};
use lapin::{
    options::{ExchangeDeclareOptions, QueueDeclareOptions},
    types::FieldTable,
    Connection, ConnectionProperties,
};
use moka::future::Cache as MokaCache;
use routes::pipelines::GraphInterruptMessage;
use semantic_search::{
    semantic_search_grpc::semantic_search_client::SemanticSearchClient, SemanticSearch,
};
use sodiumoxide;
use std::{
    any::TypeId,
    collections::HashMap,
    env,
    io::{self, Error},
    sync::Arc,
    thread::{self, JoinHandle},
};
use tokio::sync::mpsc;
use uuid::Uuid;

mod api;
mod auth;
mod cache;
mod ch;
mod chunk;
mod code_executor;
mod datasets;
mod db;
mod engine;
mod evaluations;
mod features;
mod labels;
mod language_model;
mod machine_manager;
mod names;
mod opentelemetry;
mod pipeline;
mod projects;
mod provider_api_keys;
mod routes;
mod runtime;
mod semantic_search;
mod storage;
mod traces;

const DEFAULT_CACHE_SIZE: u64 = 100; // entries
const HTTP_PAYLOAD_LIMIT: usize = 100 * 1024 * 1024; // 100MB
const GRPC_PAYLOAD_DECODING_LIMIT: usize = 100 * 1024 * 1024; // 100MB

fn tonic_error_to_io_error(err: tonic::transport::Error) -> io::Error {
    io::Error::new(io::ErrorKind::Other, err)
}

fn main() -> anyhow::Result<()> {
    sodiumoxide::init().expect("failed to initialize sodiumoxide");

    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    dotenv::dotenv().ok();

    let general_runtime =
        create_general_purpose_runtime().expect("Can't initialize general purpose runtime.");
    let runtime_handle = general_runtime.handle().clone();

    let mut handles: Vec<JoinHandle<Result<(), Error>>> = vec![];

    std::env::set_var("RUST_LOG", "info");
    env_logger::init();

    let port = env::var("PORT")
        .unwrap_or(String::from("8000"))
        .parse()
        .unwrap();
    let grpc_port: u16 = env::var("GRPC_PORT")
        .unwrap_or(String::from("8001"))
        .parse()
        .unwrap();
    let grpc_address = format!("0.0.0.0:{}", grpc_port).parse().unwrap();

    let mut caches: HashMap<TypeId, Arc<dyn CacheTrait>> = HashMap::new();
    let auth_cache: Arc<MokaCache<String, User>> = Arc::new(MokaCache::new(DEFAULT_CACHE_SIZE));
    caches.insert(TypeId::of::<User>(), auth_cache);
    let project_api_key_cache: Arc<MokaCache<String, ProjectApiKey>> =
        Arc::new(MokaCache::new(DEFAULT_CACHE_SIZE));
    caches.insert(TypeId::of::<ProjectApiKey>(), project_api_key_cache);
    let pipeline_version_cache: Arc<MokaCache<String, PipelineVersion>> =
        Arc::new(MokaCache::new(DEFAULT_CACHE_SIZE));
    caches.insert(TypeId::of::<PipelineVersion>(), pipeline_version_cache);
    let project_cache: Arc<MokaCache<String, Project>> =
        Arc::new(MokaCache::new(DEFAULT_CACHE_SIZE));
    caches.insert(TypeId::of::<Project>(), project_cache);
    let workspace_limits_cache: Arc<MokaCache<String, WorkspaceLimitsExceeded>> =
        Arc::new(MokaCache::new(DEFAULT_CACHE_SIZE));
    caches.insert(
        TypeId::of::<WorkspaceLimitsExceeded>(),
        workspace_limits_cache,
    );
    let llm_costs_cache: Arc<MokaCache<String, LLMPriceEntry>> =
        Arc::new(MokaCache::new(DEFAULT_CACHE_SIZE));
    caches.insert(TypeId::of::<LLMPriceEntry>(), llm_costs_cache);

    let cache = Arc::new(Cache::new(caches));

    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let mut pool = None;
    runtime_handle.block_on(async {
        pool = Some(
            sqlx::postgres::PgPoolOptions::new()
                .max_connections(
                    env::var("DATABASE_MAX_CONNECTIONS")
                        .unwrap_or(String::from("10"))
                        .parse()
                        .unwrap_or(10),
                )
                .connect(&db_url)
                .await
                .unwrap(),
        );
    });
    let pool = pool.unwrap();

    let db = Arc::new(db::DB::new(pool));

    let mut chunkers = HashMap::new();
    let character_split_chunker = CharacterSplitChunker {};
    chunkers.insert(
        ChunkerType::CharacterSplit,
        Chunker::CharacterSplit(character_split_chunker),
    );
    let chunker_runner = Arc::new(ChunkerRunner::new(chunkers));

    let interrupt_senders = Arc::new(DashMap::<Uuid, mpsc::Sender<GraphInterruptMessage>>::new());

    let clickhouse_url = env::var("CLICKHOUSE_URL").expect("CLICKHOUSE_URL must be set");
    let clickhouse_user = env::var("CLICKHOUSE_USER").expect("CLICKHOUSE_USER must be set");
    let clickhouse_password = env::var("CLICKHOUSE_PASSWORD");
    let client = clickhouse::Client::default()
        .with_url(clickhouse_url)
        .with_user(clickhouse_user)
        .with_database("default")
        .with_option("async_insert", "1")
        .with_option("wait_for_async_insert", "0");

    let clickhouse = match clickhouse_password {
        Ok(password) => client.with_password(password),
        _ => {
            log::warn!("CLICKHOUSE_PASSWORD not set, using without password");
            client
        }
    };

    let mut rabbitmq_connection = None;
    runtime_handle.block_on(async {
        if is_feature_enabled(Feature::FullBuild) {
            let rabbitmq_url = env::var("RABBITMQ_URL").expect("RABBITMQ_URL must be set");
            let connection = Arc::new(
                Connection::connect(&rabbitmq_url, ConnectionProperties::default())
                    .await
                    .unwrap(),
            );

            // declare the exchange
            let channel = connection.create_channel().await.unwrap();
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
            rabbitmq_connection = Some(connection);
        }
    });
    let rabbitmq_connection_grpc = rabbitmq_connection.clone();

    let mut aws_sdk_config = None;
    runtime_handle.block_on(async {
        aws_sdk_config = Some(
            aws_config::defaults(BehaviorVersion::latest())
                .region(aws_config::Region::new(
                    env::var("AWS_REGION").unwrap_or("us-east-1".to_string()),
                ))
                .load()
                .await,
        );
    });
    let aws_sdk_config = aws_sdk_config.unwrap();
    let storage: Arc<dyn Storage> = if is_feature_enabled(Feature::Storage) {
        let s3_client = aws_sdk_s3::Client::new(&aws_sdk_config);
        let s3_storage = storage::s3::S3Storage::new(
            s3_client,
            env::var("S3_TRACE_PAYLOADS_BUCKET").expect("S3_TRACE_PAYLOADS_BUCKET must be set"),
        );
        Arc::new(s3_storage)
    } else {
        Arc::new(MockStorage {})
    };

    let runtime_handle_for_http = runtime_handle.clone();
    let db_for_http = db.clone();
    let cache_for_http = cache.clone();
    let clickhouse_for_grpc = clickhouse.clone();
    let http_server_handle = thread::Builder::new()
        .name("http".to_string())
        .spawn(move || {
            runtime_handle_for_http.block_on(async {
                let semantic_search: Arc<dyn SemanticSearch> =
                    if is_feature_enabled(Feature::FullBuild) {
                        let semantic_search_url = env::var("SEMANTIC_SEARCH_URL")
                            .expect("SEMANTIC_SEARCH_URL must be set");

                        let semantic_search_client = Arc::new(
                            SemanticSearchClient::connect(semantic_search_url)
                                .await
                                .unwrap(),
                        );
                        Arc::new(
                            semantic_search::semantic_search_impl::SemanticSearchImpl::new(
                                semantic_search_client,
                            ),
                        )
                    } else {
                        Arc::new(semantic_search::mock::MockSemanticSearch {})
                    };

                let code_executor: Arc<dyn CodeExecutor> = if is_feature_enabled(Feature::FullBuild)
                {
                    let code_executor_url =
                        env::var("CODE_EXECUTOR_URL").expect("CODE_EXECUTOR_URL must be set");
                    let code_executor_client = Arc::new(
                        CodeExecutorClient::connect(code_executor_url)
                            .await
                            .unwrap(),
                    );
                    Arc::new(code_executor::code_executor_impl::CodeExecutorImpl::new(
                        code_executor_client,
                    ))
                } else {
                    Arc::new(code_executor::mock::MockCodeExecutor {})
                };

                let machine_manager: Arc<dyn MachineManager> =
                    if is_feature_enabled(Feature::MachineManager) {
                        let machine_manager_url_grpc = env::var("MACHINE_MANAGER_URL_GRPC")
                            .expect("MACHINE_MANAGER_URL_GRPC must be set");
                        let machine_manager_client = Arc::new(
                            MachineManagerServiceClient::connect(machine_manager_url_grpc)
                                .await
                                .unwrap(),
                        );
                        Arc::new(MachineManagerImpl::new(machine_manager_client))
                    } else {
                        Arc::new(machine_manager::MockMachineManager {})
                    };

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
                        aws_sdk_bedrockruntime::Client::new(&aws_sdk_config),
                    )),
                );
                let language_model_runner =
                    Arc::new(language_model::LanguageModelRunner::new(language_models));

                let name_generator = Arc::new(NameGenerator::new());

                HttpServer::new(move || {
                    let auth = HttpAuthentication::bearer(auth::validator);
                    let project_auth = HttpAuthentication::bearer(auth::project_validator);
                    let shared_secret_auth =
                        HttpAuthentication::bearer(auth::shared_secret_validator);

                    let pipeline_runner = Arc::new(pipeline::runner::PipelineRunner::new(
                        language_model_runner.clone(),
                        semantic_search.clone(),
                        rabbitmq_connection.clone(),
                        code_executor.clone(),
                        db_for_http.clone(),
                        cache_for_http.clone(),
                    ));

                    // start 8 threads per core to process spans from RabbitMQ
                    if is_feature_enabled(Feature::FullBuild) {
                        for _ in 0..8 {
                            tokio::spawn(process_queue_spans(
                                pipeline_runner.clone(),
                                db_for_http.clone(),
                                cache_for_http.clone(),
                                semantic_search.clone(),
                                rabbitmq_connection.clone(),
                                clickhouse.clone(),
                                chunker_runner.clone(),
                                storage.clone(),
                            ));
                        }
                    }

                    App::new()
                        .wrap(Logger::default())
                        .wrap(NormalizePath::trim())
                        .app_data(web::Data::from(cache_for_http.clone()))
                        .app_data(web::Data::from(db_for_http.clone()))
                        .app_data(web::Data::new(pipeline_runner.clone()))
                        .app_data(web::Data::new(semantic_search.clone()))
                        .app_data(web::Data::new(interrupt_senders.clone()))
                        .app_data(web::Data::new(language_model_runner.clone()))
                        .app_data(web::Data::new(rabbitmq_connection.clone()))
                        .app_data(web::Data::new(clickhouse.clone()))
                        .app_data(web::Data::new(name_generator.clone()))
                        .app_data(web::Data::new(semantic_search.clone()))
                        .app_data(web::Data::new(chunker_runner.clone()))
                        .app_data(web::Data::new(storage.clone()))
                        .app_data(web::Data::new(machine_manager.clone()))
                        // Scopes with specific auth or no auth
                        .service(
                            web::scope("api/v1/auth")
                                .wrap(shared_secret_auth.clone())
                                .service(routes::auth::signin),
                        )
                        .service(
                            web::scope("api/v1/auth")
                                .wrap(shared_secret_auth.clone())
                                .service(routes::auth::signin),
                        )
                        .service(
                            web::scope("api/v1/manage-subscriptions")
                                .wrap(shared_secret_auth)
                                .service(routes::subscriptions::update_subscription),
                        )
                        .service(api::v1::machine_manager::vnc_stream) // vnc stream does not need auth
                        .service(
                            web::scope("/v1")
                                .wrap(project_auth.clone())
                                .app_data(PayloadConfig::new(HTTP_PAYLOAD_LIMIT))
                                .app_data(JsonConfig::default().limit(HTTP_PAYLOAD_LIMIT))
                                .service(api::v1::pipelines::run_pipeline_graph)
                                .service(api::v1::pipelines::ping_healthcheck)
                                .service(api::v1::traces::process_traces)
                                .service(api::v1::datasets::get_datapoints)
                                .service(api::v1::evaluations::create_evaluation)
                                .service(api::v1::metrics::process_metrics)
                                .service(api::v1::semantic_search::semantic_search)
                                .service(api::v1::queues::push_to_queue)
                                .service(api::v1::machine_manager::start_machine)
                                .service(api::v1::machine_manager::terminate_machine)
                                .service(api::v1::machine_manager::execute_computer_action),
                        )
                        // Scopes with generic auth
                        .service(
                            web::scope("/api/v1/workspaces")
                                .wrap(auth.clone())
                                .service(routes::workspace::get_all_workspaces_of_user)
                                .service(routes::workspace::get_workspace)
                                .service(routes::workspace::create_workspace)
                                .service(routes::workspace::add_user_to_workspace),
                        )
                        .service(
                            web::scope("/api/v1/limits")
                                .wrap(auth.clone())
                                .service(routes::limits::get_workspace_stats)
                                .service(routes::limits::get_workspace_storage_stats),
                        )
                        .service(
                            web::scope("/api/v1/subscriptions")
                                .wrap(auth.clone())
                                .service(routes::subscriptions::save_stripe_customer_id)
                                .service(routes::subscriptions::get_user_subscription_info),
                        )
                        .service(
                            web::scope("/api/v1/projects")
                                .wrap(auth)
                                .service(routes::projects::create_project)
                                .service(routes::projects::get_projects)
                                .service(
                                    web::scope("/{project_id}")
                                        .wrap_fn(|req: actix_web::dev::ServiceRequest, srv| {
                                            let project_id = Uuid::parse_str(
                                                req.match_info().get("project_id").unwrap(),
                                            )
                                            .unwrap();
                                            let user: User;
                                            {
                                                let binding = req.extensions();
                                                // it is safe to unwrap here because if this middle runs user is present in the request
                                                user = binding.get::<User>().cloned().unwrap();
                                            }
                                            if user
                                                .project_ids
                                                .as_ref()
                                                .unwrap()
                                                .contains(&project_id)
                                            {
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
                                        .service(routes::evaluations::get_evaluation_score_stats)
                                        .service(
                                            routes::evaluations::get_evaluation_score_distribution,
                                        )
                                        .service(routes::datasets::delete_dataset)
                                        .service(routes::datasets::upload_datapoint_file)
                                        .service(routes::datasets::create_datapoint_embeddings)
                                        .service(routes::datasets::update_datapoint_embeddings)
                                        .service(routes::datasets::delete_datapoint_embeddings)
                                        .service(routes::datasets::delete_all_datapoints)
                                        .service(routes::datasets::index_dataset)
                                        .service(routes::traces::search_traces)
                                        .service(routes::labels::get_label_classes)
                                        .service(routes::labels::get_span_labels)
                                        .service(routes::labels::update_span_label)
                                        .service(routes::labels::delete_span_label)
                                        .service(routes::labels::register_label_class_for_path)
                                        .service(routes::labels::remove_label_class_from_path)
                                        .service(
                                            routes::labels::get_registered_label_classes_for_path,
                                        )
                                        .service(routes::labels::update_label_class)
                                        .service(routes::traces::get_traces_metrics)
                                        .service(routes::provider_api_keys::save_api_key),
                                ),
                        )
                })
                .bind(("0.0.0.0", port))?
                .run()
                .await
            })
        })
        .unwrap();
    handles.push(http_server_handle);

    let grpc_server_handle = thread::Builder::new()
        .name("grpc".to_string())
        .spawn({
            move || {
                runtime_handle.block_on(async {
                    let process_traces_service = ProcessTracesService::new(
                        db.clone(),
                        cache.clone(),
                        rabbitmq_connection_grpc.clone(),
                        clickhouse_for_grpc,
                    );

                    Server::builder()
                        .add_service(
                            TraceServiceServer::new(process_traces_service)
                                .max_decoding_message_size(GRPC_PAYLOAD_DECODING_LIMIT),
                        )
                        .serve_with_shutdown(grpc_address, async {
                            wait_stop_signal("gRPC service").await;
                        })
                        .await
                        .map_err(tonic_error_to_io_error)
                })
            }
        })
        .unwrap();
    handles.push(grpc_server_handle);

    for handle in handles {
        log::debug!(
            "Waiting for thread {} to finish",
            handle.thread().name().unwrap()
        );
        handle.join().expect("thread is not panicking")?;
    }
    Ok(())
}
