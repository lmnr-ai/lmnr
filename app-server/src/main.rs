use actix_web::{
    App, HttpServer,
    middleware::{Logger, NormalizePath},
    web::{self, JsonConfig, PayloadConfig},
};
use actix_web_httpauth::middleware::HttpAuthentication;
use agent_manager::{
    AgentManager, agent_manager_grpc::agent_manager_service_client::AgentManagerServiceClient,
    agent_manager_impl::AgentManagerImpl, channel::AgentManagerWorkers,
};
use api::v1::browser_sessions::{BROWSER_SESSIONS_EXCHANGE, BROWSER_SESSIONS_QUEUE};
use aws_config::BehaviorVersion;
use browser_events::process_browser_events;
use features::{Feature, is_feature_enabled};
use lapin::{
    Connection, ConnectionProperties, ExchangeKind,
    options::{ExchangeDeclareOptions, QueueDeclareOptions},
    types::FieldTable,
};
use machine_manager::{
    MachineManager, MachineManagerImpl, machine_manager_service_client::MachineManagerServiceClient,
};
use mq::MessageQueue;
use names::NameGenerator;
use opentelemetry::opentelemetry::proto::collector::trace::v1::trace_service_server::TraceServiceServer;
use runtime::{create_general_purpose_runtime, wait_stop_signal};
use storage::{Storage, mock::MockStorage};
use tonic::transport::Server;
use traces::{
    OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE, consumer::process_queue_spans,
    grpc_service::ProcessTracesService,
};

use cache::{Cache, in_memory::InMemoryCache, redis::RedisCache};
use sodiumoxide;
use std::{
    env,
    io::{self, Error},
    sync::Arc,
    thread::{self, JoinHandle},
};

mod agent_manager;
mod api;
mod auth;
mod browser_events;
mod cache;
mod ch;
mod datasets;
mod db;
mod evaluations;
mod features;
mod labels;
mod language_model;
mod machine_manager;
mod mq;
mod names;
mod opentelemetry;
mod project_api_keys;
mod provider_api_keys;
mod routes;
mod runtime;
mod storage;
mod traces;
mod utils;

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

    if env::var("RUST_LOG").is_ok_and(|s| !s.is_empty()) {
        env_logger::init();
    } else {
        env_logger::builder()
            .filter_level(log::LevelFilter::Info)
            .init();
    }

    let http_payload_limit: usize = env::var("HTTP_PAYLOAD_LIMIT")
        .unwrap_or(String::from("5242880")) // default to 5MB
        .parse()
        .unwrap();

    log::info!("HTTP payload limit: {}", http_payload_limit);

    let grpc_payload_limit: usize = env::var("GRPC_PAYLOAD_LIMIT")
        .unwrap_or(String::from("26214400")) // default to 25MB
        .parse()
        .unwrap();

    log::info!("GRPC payload limit: {}", grpc_payload_limit);

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
        log::info!("Using Redis cache");
        runtime_handle.block_on(async {
            let redis_cache = RedisCache::new(&redis_url).await.unwrap();
            Cache::Redis(redis_cache)
        })
    } else {
        log::info!("using in-memory cache");
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

            log::info!("RabbitMQ span channels: {}", max_channel_pool_size);

            let rabbit_mq = mq::rabbit::RabbitMQ::new(connection.clone(), max_channel_pool_size);
            Arc::new(rabbit_mq.into())
        })
    } else {
        log::info!("Using tokio mpsc span queue");
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

            log::info!(
                "RabbitMQ browser events channels: {}",
                max_channel_pool_size
            );

            let rabbit_mq = mq::rabbit::RabbitMQ::new(connection.clone(), max_channel_pool_size);
            Arc::new(rabbit_mq.into())
        })
    } else {
        log::info!("Using tokio mpsc browser events queue");
        Arc::new(mq::tokio_mpsc::TokioMpscQueue::new().into())
    };

    // ==== 3.3 Agent worker message queue ====
    let agent_manager_workers = Arc::new(AgentManagerWorkers::new());

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
                    log::info!("using S3 storage");
                    let s3_client = aws_sdk_s3::Client::new(&aws_sdk_config);
                    let s3_storage = storage::s3::S3Storage::new(
                        s3_client,
                        env::var("S3_TRACE_PAYLOADS_BUCKET")
                            .expect("S3_TRACE_PAYLOADS_BUCKET must be set"),
                    );
                    Arc::new(s3_storage.into())
                } else {
                    log::info!("using mock storage");
                    Arc::new(MockStorage {}.into())
                };

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
                        log::info!("Machine manager URL: {}", machine_manager_url_grpc);
                        let machine_manager_client = Arc::new(
                            MachineManagerServiceClient::connect(machine_manager_url_grpc)
                                .await
                                .unwrap(),
                        );
                        Arc::new(MachineManagerImpl::new(machine_manager_client).into())
                    } else {
                        log::info!("Using mock machine manager");
                        Arc::new(machine_manager::MockMachineManager {}.into())
                    };

                // == Browser agent ==
                let browser_agent: Arc<AgentManager> = if is_feature_enabled(Feature::AgentManager)
                {
                    let agent_manager_url =
                        env::var("AGENT_MANAGER_URL").expect("AGENT_MANAGER_URL must be set");
                    log::info!("Agent manager URL: {}", agent_manager_url);
                    let agent_manager_client = Arc::new(
                        AgentManagerServiceClient::connect(agent_manager_url)
                            .await
                            .unwrap(),
                    );
                    Arc::new(AgentManagerImpl::new(agent_manager_client).into())
                } else {
                    log::info!("Using mock agent manager");
                    Arc::new(agent_manager::mock::MockAgentManager {}.into())
                };

                // == Name generator ==
                let name_generator = Arc::new(NameGenerator::new());

                let num_spans_workers_per_thread = env::var("NUM_SPANS_WORKERS_PER_THREAD")
                    .unwrap_or(String::from("4"))
                    .parse::<u8>()
                    .unwrap_or(4);

                let num_browser_events_workers_per_thread =
                    env::var("NUM_BROWSER_EVENTS_WORKERS_PER_THREAD")
                        .unwrap_or(String::from("4"))
                        .parse::<u8>()
                        .unwrap_or(4);

                log::info!(
                    "Spans workers per thread: {}, Browser events workers per thread: {}",
                    num_spans_workers_per_thread,
                    num_browser_events_workers_per_thread
                );

                HttpServer::new(move || {
                    let auth = HttpAuthentication::bearer(auth::validator);
                    let project_auth = HttpAuthentication::bearer(auth::project_validator);

                    for _ in 0..num_spans_workers_per_thread {
                        tokio::spawn(process_queue_spans(
                            db_for_http.clone(),
                            cache_for_http.clone(),
                            spans_mq_for_http.clone(),
                            clickhouse.clone(),
                            storage.clone(),
                        ));
                    }

                    for _ in 0..num_browser_events_workers_per_thread {
                        tokio::spawn(process_browser_events(
                            db_for_http.clone(),
                            clickhouse.clone(),
                            browser_events_message_queue.clone(),
                        ));
                    }

                    App::new()
                        .wrap(Logger::default().exclude("/health"))
                        .wrap(NormalizePath::trim())
                        .app_data(JsonConfig::default().limit(http_payload_limit))
                        .app_data(PayloadConfig::new(http_payload_limit))
                        .app_data(web::Data::from(cache_for_http.clone()))
                        .app_data(web::Data::from(db_for_http.clone()))
                        .app_data(web::Data::new(spans_mq_for_http.clone()))
                        .app_data(web::Data::new(clickhouse.clone()))
                        .app_data(web::Data::new(name_generator.clone()))
                        .app_data(web::Data::new(storage.clone()))
                        .app_data(web::Data::new(machine_manager.clone()))
                        .app_data(web::Data::new(browser_events_message_queue.clone()))
                        .app_data(web::Data::new(agent_manager_workers.clone()))
                        .app_data(web::Data::new(connection_for_health.clone()))
                        .app_data(web::Data::new(browser_agent.clone()))
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
                                .service(routes::agent::run_agent_manager)
                                .service(routes::agent::stop_agent_manager),
                        )
                        .service(
                            web::scope("/v1")
                                .wrap(project_auth.clone())
                                .service(api::v1::traces::process_traces)
                                .service(api::v1::datasets::get_datapoints)
                                .service(api::v1::evaluations::create_evaluation)
                                .service(api::v1::metrics::process_metrics)
                                .service(api::v1::queues::push_to_queue)
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
                                .service(routes::api_keys::create_project_api_key)
                                .service(routes::api_keys::get_api_keys_for_project)
                                .service(routes::api_keys::revoke_project_api_key)
                                .service(routes::evaluations::get_evaluation_score_stats)
                                .service(routes::evaluations::get_evaluation_score_distribution)
                                .service(routes::datasets::upload_datapoint_file)
                                .service(routes::labels::get_label_classes)
                                .service(routes::labels::register_label_class_for_path)
                                .service(routes::labels::remove_label_class_from_path)
                                .service(routes::labels::get_registered_label_classes_for_path)
                                .service(routes::labels::update_label_class)
                                .service(routes::traces::get_traces_metrics)
                                .service(routes::provider_api_keys::save_api_key)
                                .service(routes::spans::create_span),
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
