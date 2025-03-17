use actix_web::{
    middleware::{Logger, NormalizePath},
    web::{self, JsonConfig, PayloadConfig},
    App, HttpServer,
};
use actix_web_httpauth::middleware::HttpAuthentication;
use agent_manager::{
    agent_manager_grpc::agent_manager_service_client::AgentManagerServiceClient,
    agent_manager_impl::AgentManagerImpl, channel::AgentManagerChannel, AgentManager,
};
use api::v1::browser_sessions::{BROWSER_SESSIONS_EXCHANGE, BROWSER_SESSIONS_QUEUE};
use aws_config::BehaviorVersion;
use browser_events::process_browser_events;
use code_executor::{code_executor_grpc::code_executor_client::CodeExecutorClient, CodeExecutor};
use dashmap::DashMap;
use features::{is_feature_enabled, Feature};
use lapin::{
    options::{ExchangeDeclareOptions, QueueDeclareOptions},
    types::FieldTable,
    Connection, ConnectionProperties, ExchangeKind,
};
use machine_manager::{
    machine_manager_service_client::MachineManagerServiceClient, MachineManager, MachineManagerImpl,
};
use mq::MessageQueue;
use names::NameGenerator;
use opentelemetry::opentelemetry::proto::collector::trace::v1::trace_service_server::TraceServiceServer;
use runtime::{create_general_purpose_runtime, wait_stop_signal};
use storage::{mock::MockStorage, Storage};
use tonic::transport::Server;
use traces::{
    consumer::process_queue_spans, grpc_service::ProcessTracesService, OBSERVATIONS_EXCHANGE,
    OBSERVATIONS_QUEUE,
};

use cache::{in_memory::InMemoryCache, redis::RedisCache, Cache};
use chunk::{
    character_split::CharacterSplitChunker,
    runner::{Chunker, ChunkerRunner, ChunkerType},
};
use language_model::{LanguageModelProvider, LanguageModelProviderName};
use routes::pipelines::GraphInterruptMessage;
use semantic_search::{
    semantic_search_grpc::semantic_search_client::SemanticSearchClient, SemanticSearch,
};
use sodiumoxide;
use std::{
    collections::HashMap,
    env,
    io::{self, Error},
    sync::Arc,
    thread::{self, JoinHandle},
};
use tokio::sync::mpsc;
use uuid::Uuid;

mod agent_manager;
mod api;
mod auth;
mod browser_events;
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
mod mq;
mod names;
mod opentelemetry;
mod pipeline;
mod project_api_keys;
mod provider_api_keys;
mod routes;
mod runtime;
mod semantic_search;
mod storage;
mod traces;

fn tonic_error_to_io_error(err: tonic::transport::Error) -> io::Error {
    io::Error::new(io::ErrorKind::Other, err)
}

fn main() -> anyhow::Result<()> {
    // == Crypto utils ==
    sodiumoxide::init().expect("failed to initialize sodiumoxide");

    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    // == General configuration ==
    dotenv::dotenv().ok();

    let general_runtime =
        create_general_purpose_runtime().expect("Can't initialize general purpose runtime.");
    let runtime_handle = general_runtime.handle().clone();

    let mut handles: Vec<JoinHandle<Result<(), Error>>> = vec![];

    std::env::set_var("RUST_LOG", "info");
    env_logger::init();

    let http_payload_limit: usize = env::var("HTTP_PAYLOAD_LIMIT")
        .unwrap_or(String::from("5242880")) // default to 5MB
        .parse()
        .unwrap();

    let grpc_payload_limit: usize = env::var("GRPC_PAYLOAD_LIMIT")
        .unwrap_or(String::from("26214400")) // default to 25MB
        .parse()
        .unwrap();

    let port = env::var("PORT")
        .unwrap_or(String::from("8000"))
        .parse()
        .unwrap();
    let grpc_port: u16 = env::var("GRPC_PORT")
        .unwrap_or(String::from("8001"))
        .parse()
        .unwrap();
    let grpc_address = format!("0.0.0.0:{}", grpc_port).parse().unwrap();

    // == Stuff that is needed both for HTTP and gRPC servers ==
    // === 1. Cache ===
    let cache = if let Ok(redis_url) = env::var("REDIS_URL") {
        runtime_handle.block_on(async {
            let redis_cache = RedisCache::new(&redis_url).await.unwrap();
            Cache::Redis(redis_cache)
        })
    } else {
        Cache::InMemory(InMemoryCache::new(None))
    };
    let cache = Arc::new(cache);

    // === 2. Database ===
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let max_connections = env::var("DATABASE_MAX_CONNECTIONS")
        .unwrap_or(String::from("10"))
        .parse()
        .unwrap_or(10);

    log::info!("Database max connections: {}", max_connections);

    let pool = runtime_handle.block_on(async {
        sqlx::postgres::PgPoolOptions::new()
            .max_connections(max_connections)
            .connect(&db_url)
            .await
            .unwrap()
    });

    let db = Arc::new(db::DB::new(pool));

    // === 3. Message queues ===
    let connection = if is_feature_enabled(Feature::FullBuild) {
        let rabbitmq_url = env::var("RABBITMQ_URL").expect("RABBITMQ_URL must be set");
        runtime_handle.block_on(async {
            Some(Arc::new(
                Connection::connect(&rabbitmq_url, ConnectionProperties::default())
                    .await
                    .unwrap(),
            ))
        })
    } else {
        None
    };

    let connection_for_health = connection.clone(); // Clone before moving into HttpServer

    // ==== 3.1 Spans message queue ====
    let spans_message_queue: Arc<MessageQueue> = if let Some(connection) = connection.as_ref() {
        runtime_handle.block_on(async {
            let channel = connection.create_channel().await.unwrap();

            channel
                .exchange_declare(
                    OBSERVATIONS_EXCHANGE,
                    ExchangeKind::Fanout,
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

            let max_channel_pool_size = env::var("RABBITMQ_MAX_CHANNEL_POOL_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(64);

            let rabbit_mq = mq::rabbit::RabbitMQ::new(connection.clone(), max_channel_pool_size);
            Arc::new(rabbit_mq.into())
        })
    } else {
        Arc::new(mq::tokio_mpsc::TokioMpscQueue::new().into())
    };

    // ==== 3.2 Browser events message queue ====
    let browser_events_message_queue: Arc<MessageQueue> = if let Some(connection) =
        connection.as_ref()
    {
        runtime_handle.block_on(async {
            let channel = connection.create_channel().await.unwrap();

            channel
                .exchange_declare(
                    BROWSER_SESSIONS_EXCHANGE,
                    ExchangeKind::Fanout,
                    ExchangeDeclareOptions::default(),
                    FieldTable::default(),
                )
                .await
                .unwrap();

            channel
                .queue_declare(
                    BROWSER_SESSIONS_QUEUE,
                    QueueDeclareOptions::default(),
                    FieldTable::default(),
                )
                .await
                .unwrap();

            let max_channel_pool_size = env::var("RABBITMQ_MAX_CHANNEL_POOL_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(64);

            let rabbit_mq = mq::rabbit::RabbitMQ::new(connection.clone(), max_channel_pool_size);
            Arc::new(rabbit_mq.into())
        })
    } else {
        Arc::new(mq::tokio_mpsc::TokioMpscQueue::new().into())
    };

    // ==== 3.3 Agent worker message queue ====
    let agent_manager_channel = Arc::new(AgentManagerChannel::new());

    let runtime_handle_for_http = runtime_handle.clone();
    let db_for_http = db.clone();
    let cache_for_http = cache.clone();
    let spans_mq_for_http = spans_message_queue.clone();

    // == HTTP server and listener workers ==
    let http_server_handle = thread::Builder::new()
        .name("http".to_string())
        .spawn(move || {
            runtime_handle_for_http.block_on(async {
                // == AWS config for S3 and Bedrock ==
                let aws_sdk_config = aws_config::defaults(BehaviorVersion::latest())
                    .region(aws_config::Region::new(
                        env::var("AWS_REGION").unwrap_or("us-east-1".to_string()),
                    ))
                    .load()
                    .await;

                // == Storage ==
                let storage: Arc<Storage> = if is_feature_enabled(Feature::Storage) {
                    let s3_client = aws_sdk_s3::Client::new(&aws_sdk_config);
                    let s3_storage = storage::s3::S3Storage::new(
                        s3_client,
                        env::var("S3_TRACE_PAYLOADS_BUCKET")
                            .expect("S3_TRACE_PAYLOADS_BUCKET must be set"),
                    );
                    Arc::new(s3_storage.into())
                } else {
                    Arc::new(MockStorage {}.into())
                };

                // == Chunkers ==
                // TODO: either add chunkers back to the datasets or remove them from code
                let mut chunkers = HashMap::new();
                let character_split_chunker = CharacterSplitChunker {};
                chunkers.insert(
                    ChunkerType::CharacterSplit,
                    Chunker::CharacterSplit(character_split_chunker),
                );
                let chunker_runner = Arc::new(ChunkerRunner::new(chunkers));

                // == Clickhouse ==
                let clickhouse_url =
                    env::var("CLICKHOUSE_URL").expect("CLICKHOUSE_URL must be set");
                let clickhouse_user =
                    env::var("CLICKHOUSE_USER").expect("CLICKHOUSE_USER must be set");
                let clickhouse_password = env::var("CLICKHOUSE_PASSWORD");
                let clickhouse_client = clickhouse::Client::default()
                    .with_url(clickhouse_url)
                    .with_user(clickhouse_user)
                    .with_database("default")
                    .with_option("async_insert", "1")
                    .with_option("wait_for_async_insert", "0");

                let clickhouse = match clickhouse_password {
                    Ok(password) => clickhouse_client.with_password(password),
                    _ => {
                        log::warn!("CLICKHOUSE_PASSWORD not set, using without password");
                        clickhouse_client
                    }
                };

                // == Machine manager ==
                let machine_manager: Arc<MachineManager> =
                    if is_feature_enabled(Feature::MachineManager) {
                        let machine_manager_url_grpc = env::var("MACHINE_MANAGER_URL_GRPC")
                            .expect("MACHINE_MANAGER_URL_GRPC must be set");
                        let machine_manager_client = Arc::new(
                            MachineManagerServiceClient::connect(machine_manager_url_grpc)
                                .await
                                .unwrap(),
                        );
                        Arc::new(MachineManagerImpl::new(machine_manager_client).into())
                    } else {
                        Arc::new(machine_manager::MockMachineManager {}.into())
                    };

                // == Browser agent ==
                let browser_agent: Arc<AgentManager> = if is_feature_enabled(Feature::AgentManager)
                {
                    let agent_manager_url =
                        env::var("AGENT_MANAGER_URL").expect("AGENT_MANAGER_URL must be set");
                    let agent_manager_client = Arc::new(
                        AgentManagerServiceClient::connect(agent_manager_url)
                            .await
                            .unwrap(),
                    );
                    Arc::new(AgentManagerImpl::new(agent_manager_client).into())
                } else {
                    Arc::new(agent_manager::mock::MockAgentManager {}.into())
                };

                // == Name generator ==
                let name_generator = Arc::new(NameGenerator::new());

                // == Interrupt senders for pipeline execution control ==
                let interrupt_senders =
                    Arc::new(DashMap::<Uuid, mpsc::Sender<GraphInterruptMessage>>::new());

                // == Semantic search ==
                let semantic_search: Arc<SemanticSearch> = if is_feature_enabled(Feature::FullBuild)
                {
                    let semantic_search_url =
                        env::var("SEMANTIC_SEARCH_URL").expect("SEMANTIC_SEARCH_URL must be set");

                    let semantic_search_client = Arc::new(
                        SemanticSearchClient::connect(semantic_search_url)
                            .await
                            .unwrap(),
                    );
                    Arc::new(
                        semantic_search::semantic_search_impl::SemanticSearchImpl::new(
                            semantic_search_client,
                        )
                        .into(),
                    )
                } else {
                    Arc::new(semantic_search::mock::MockSemanticSearch {}.into())
                };

                // == Python executor ==
                let code_executor: Arc<CodeExecutor> = if is_feature_enabled(Feature::FullBuild) {
                    let code_executor_url =
                        env::var("CODE_EXECUTOR_URL").expect("CODE_EXECUTOR_URL must be set");
                    let code_executor_client = Arc::new(
                        CodeExecutorClient::connect(code_executor_url)
                            .await
                            .unwrap(),
                    );
                    Arc::new(
                        code_executor::code_executor_impl::CodeExecutorImpl::new(
                            code_executor_client,
                        )
                        .into(),
                    )
                } else {
                    Arc::new(code_executor::mock::MockCodeExecutor {}.into())
                };

                // == Language models ==
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

                // == Pipeline runner ==
                let pipeline_runner = Arc::new(pipeline::runner::PipelineRunner::new(
                    language_model_runner.clone(),
                    semantic_search.clone(),
                    spans_mq_for_http.clone(),
                    code_executor.clone(),
                    db_for_http.clone(),
                    cache_for_http.clone(),
                ));

                HttpServer::new(move || {
                    let auth = HttpAuthentication::bearer(auth::validator);
                    let project_auth = HttpAuthentication::bearer(auth::project_validator);
                    let shared_secret_auth =
                        HttpAuthentication::bearer(auth::shared_secret_validator);

                    let num_spans_workers_per_thread = env::var("NUM_SPANS_WORKERS_PER_THREAD")
                        .unwrap_or(String::from("4"))
                        .parse::<u8>()
                        .unwrap_or(4);

                    let num_browser_events_workers_per_thread =
                        env::var("NUM_BROWSER_EVENTS_WORKERS_PER_THREAD")
                            .unwrap_or(String::from("4"))
                            .parse::<u8>()
                            .unwrap_or(4);

                    for _ in 0..num_spans_workers_per_thread {
                        tokio::spawn(process_queue_spans(
                            pipeline_runner.clone(),
                            db_for_http.clone(),
                            cache_for_http.clone(),
                            spans_mq_for_http.clone(),
                            clickhouse.clone(),
                            storage.clone(),
                        ));
                    }

                    for _ in 0..num_browser_events_workers_per_thread {
                        tokio::spawn(process_browser_events(
                            clickhouse.clone(),
                            browser_events_message_queue.clone(),
                        ));
                    }

                    App::new()
                        .wrap(Logger::default())
                        .wrap(NormalizePath::trim())
                        .app_data(JsonConfig::default().limit(http_payload_limit))
                        .app_data(PayloadConfig::new(http_payload_limit))
                        .app_data(web::Data::from(cache_for_http.clone()))
                        .app_data(web::Data::from(db_for_http.clone()))
                        .app_data(web::Data::new(pipeline_runner.clone()))
                        .app_data(web::Data::new(semantic_search.clone()))
                        .app_data(web::Data::new(interrupt_senders.clone()))
                        .app_data(web::Data::new(language_model_runner.clone()))
                        .app_data(web::Data::new(spans_mq_for_http.clone()))
                        .app_data(web::Data::new(clickhouse.clone()))
                        .app_data(web::Data::new(name_generator.clone()))
                        .app_data(web::Data::new(semantic_search.clone()))
                        .app_data(web::Data::new(chunker_runner.clone()))
                        .app_data(web::Data::new(storage.clone()))
                        .app_data(web::Data::new(machine_manager.clone()))
                        .app_data(web::Data::new(browser_events_message_queue.clone()))
                        .app_data(web::Data::new(agent_manager_channel.clone()))
                        .app_data(web::Data::new(connection_for_health.clone()))
                        .app_data(web::Data::new(browser_agent.clone()))
                        // Scopes with specific auth or no auth
                        .service(
                            web::scope("api/v1/auth")
                                .wrap(shared_secret_auth.clone())
                                .service(routes::auth::signin),
                        )
                        .service(api::v1::machine_manager::vnc_stream) // vnc stream does not need auth
                        .service(
                            web::scope("/v1/browser-sessions")
                                .service(api::v1::browser_sessions::options_handler)
                                .service(
                                    web::scope("")
                                        .wrap(project_auth.clone())
                                        .service(api::v1::browser_sessions::create_session_event),
                                ),
                        )
                        .service(
                            web::scope("api/v1/agent")
                                .wrap(auth.clone())
                                .service(routes::agent::run_agent_manager),
                        )
                        .service(
                            web::scope("/v1")
                                .wrap(project_auth.clone())
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
                                .service(api::v1::machine_manager::execute_computer_action)
                                .service(api::v1::browser_sessions::create_session_event)
                                .service(api::v1::evals::init_eval)
                                .service(api::v1::evals::save_eval_datapoints)
                                .service(api::v1::agent::run_agent_manager),
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
                            // auth on path projects/{project_id} is handled by middleware on Next.js
                            web::scope("/api/v1/projects/{project_id}")
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
                                .service(routes::evaluations::get_evaluation_score_distribution)
                                .service(routes::datasets::delete_dataset)
                                .service(routes::datasets::upload_datapoint_file)
                                .service(routes::datasets::create_datapoint_embeddings)
                                .service(routes::datasets::update_datapoint_embeddings)
                                .service(routes::datasets::delete_datapoint_embeddings)
                                .service(routes::datasets::delete_all_datapoints)
                                .service(routes::datasets::index_dataset)
                                .service(routes::labels::get_label_classes)
                                .service(routes::labels::register_label_class_for_path)
                                .service(routes::labels::remove_label_class_from_path)
                                .service(routes::labels::get_registered_label_classes_for_path)
                                .service(routes::labels::update_label_class)
                                .service(routes::traces::get_traces_metrics)
                                .service(routes::provider_api_keys::save_api_key),
                        )
                        .service(routes::probes::check_health)
                        .service(routes::probes::check_ready)
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
        .spawn(move || {
            runtime_handle.block_on(async {
                let process_traces_service = ProcessTracesService::new(
                    db.clone(),
                    cache.clone(),
                    spans_message_queue.clone(),
                );

                Server::builder()
                    .add_service(
                        TraceServiceServer::new(process_traces_service)
                            .accept_compressed(tonic::codec::CompressionEncoding::Gzip)
                            .send_compressed(tonic::codec::CompressionEncoding::Gzip)
                            .max_decoding_message_size(grpc_payload_limit),
                    )
                    .serve_with_shutdown(grpc_address, async {
                        wait_stop_signal("gRPC service").await;
                    })
                    .await
                    .map_err(tonic_error_to_io_error)
            })
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
