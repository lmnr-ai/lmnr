#[cfg(not(target_env = "msvc"))]
use tikv_jemallocator::Jemalloc;

#[cfg(not(target_env = "msvc"))]
#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;


use actix_web::{
    dev, http::StatusCode, middleware::{ErrorHandlerResponse, ErrorHandlers, Logger, NormalizePath}, web::{self, JsonConfig, PayloadConfig}, App, HttpServer
};
use actix_web_httpauth::middleware::HttpAuthentication;
use agent_manager::{
    AgentManager, agent_manager_grpc::agent_manager_service_client::AgentManagerServiceClient,
    agent_manager_impl::AgentManagerImpl, channel::AgentManagerWorkers,
};
use query_engine::{
    query_engine::query_engine_service_client::QueryEngineServiceClient,
    QueryEngine, query_engine_impl::QueryEngineImpl,
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
use mq::MessageQueue;
use names::NameGenerator;
use opentelemetry_proto::opentelemetry::proto::collector::trace::v1::trace_service_server::TraceServiceServer;
use runtime::{create_general_purpose_runtime, wait_stop_signal};
use storage::{Storage, mock::MockStorage, PAYLOADS_EXCHANGE, PAYLOADS_QUEUE, process_payloads};
use tonic::transport::Server;
use traces::{
    OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE, consumer::process_queue_spans,
    grpc_service::ProcessTracesService, TRACE_SUMMARY_EXCHANGE, TRACE_SUMMARY_QUEUE,
    summary::process_trace_summaries,
};

use cache::{Cache, in_memory::InMemoryCache, redis::RedisCache};
use evaluators::{EVALUATORS_EXCHANGE, EVALUATORS_QUEUE, process_evaluators};
use opentelemetry::global;
use opentelemetry::trace::TracerProvider;
use opentelemetry_sdk::trace::SdkTracerProvider;
use realtime::{SseConnectionMap, cleanup_closed_connections};
use sentry::integrations::opentelemetry as sentry_opentelemetry;
use sodiumoxide;
use std::{
    borrow::Cow, env, io::{self, Error}, sync::Arc, thread::{self, JoinHandle}
};
use tracing_subscriber::{
    layer::SubscriberExt, util::SubscriberInitExt, EnvFilter,
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
mod evaluators;
mod features;
mod language_model;
mod mq;
mod names;
mod opentelemetry_proto;
mod project_api_keys;
mod provider_api_keys;
mod query_engine;
mod realtime;
mod routes;
mod runtime;
mod sql;
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

    // == Sentry ==
    let sentry_dsn = env::var("SENTRY_DSN").unwrap_or(
        "https://1234567890@sentry.io/1234567890".to_string()
    );
    let _sentry_guard = sentry::init((sentry_dsn, sentry::ClientOptions {
        release: sentry::release_name!(),
        traces_sample_rate: 1.0,
        environment: Some(Cow::Owned(env::var("ENVIRONMENT").unwrap_or("development".to_string()))),
        before_send: Some(Arc::new(|_| {
            // We don't want Sentry to record events. We only use it for OTel tracing.
            None
        })),
        ..Default::default()
    }));

    if !is_feature_enabled(Feature::Tracing) || env::var("SENTRY_DSN").is_err() {
        // If tracing is not enabled, drop the sentry guard, thus disabling sentry
        drop(_sentry_guard);
    }

    // == OpenTelemetry Tracer Provider ==
    let tracer_provider = SdkTracerProvider::builder()
        // Register the Sentry span processor to send OpenTelemetry spans to Sentry
        .with_span_processor(sentry_opentelemetry::SentrySpanProcessor::new())
        .build();

    // == Tracing Subscriber with OpenTelemetry ==
    // Create the tracer from the provider BEFORE setting it globally
    // This ensures we have a concrete SdkTracer type, not a BoxedTracer
    let tracer = tracer_provider.tracer("app-server");
    
    // Now set the global tracer provider
    global::set_tracer_provider(tracer_provider);
    
    // Create environment filter (respects RUST_LOG env var)
    let env_filter = if env::var("RUST_LOG").is_ok_and(|s| !s.is_empty()) {
        EnvFilter::from_default_env()
    } else {
        EnvFilter::new("info")
    };

    // Set up the tracing subscriber with both OpenTelemetry and console output
    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_opentelemetry::layer().with_tracer(tracer))
        .with(tracing_subscriber::fmt::layer())
        .init();

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
    // Only enable RabbitMQ if it is a full build and RabbitMQ Feature (URL) is set
    let (publisher_connection, consumer_connection) = if is_feature_enabled(Feature::RabbitMQ) && is_feature_enabled(Feature::FullBuild) {
        let rabbitmq_url = env::var("RABBITMQ_URL").expect("RABBITMQ_URL must be set");
        runtime_handle.block_on(async {
            let publisher_conn = Arc::new(
                Connection::connect(&rabbitmq_url, ConnectionProperties::default())
                    .await
                    .unwrap(),
            );
            let consumer_conn = Arc::new(
                Connection::connect(&rabbitmq_url, ConnectionProperties::default())
                    .await
                    .unwrap(),
            );
            (Some(publisher_conn), Some(consumer_conn))
        })
    } else {
        (None, None)
    };

    let connection_for_health = publisher_connection.clone(); // Clone before moving into HttpServer

    let queue: Arc<MessageQueue> = if let (Some(publisher_conn), Some(consumer_conn)) = (publisher_connection.as_ref(), consumer_connection.as_ref()) {
        runtime_handle.block_on(async {
            let channel = publisher_conn.create_channel().await.unwrap();
            
            // Create quorum queue arguments (reused for all queues)
            let mut quorum_queue_args = FieldTable::default();
            quorum_queue_args.insert("x-queue-type".into(), lapin::types::AMQPValue::LongString("quorum".into()));
            
            // Register queues
            // ==== 3.1 Spans message queue ====
            channel
                .exchange_declare(
                    OBSERVATIONS_EXCHANGE,
                    ExchangeKind::Fanout,
                    ExchangeDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    FieldTable::default(),
                )
                .await
                .unwrap();

            channel
                .queue_declare(
                    OBSERVATIONS_QUEUE,
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    quorum_queue_args.clone(),
                )
                .await
                .unwrap();

            // ==== 3.2 Browser events message queue ====
            channel
                .exchange_declare(
                    BROWSER_SESSIONS_EXCHANGE,
                    ExchangeKind::Fanout,
                    ExchangeDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    FieldTable::default(),
                )
                .await
                .unwrap();

            channel
                .queue_declare(
                    BROWSER_SESSIONS_QUEUE,
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    quorum_queue_args.clone(),
                )
                .await
                .unwrap();

            // ==== 3.3 Evaluators message queue ====
            channel
                .exchange_declare(
                    EVALUATORS_EXCHANGE,
                    ExchangeKind::Fanout,
                    ExchangeDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    FieldTable::default(),
                )
                .await
                .unwrap();

            channel
                .queue_declare(
                    EVALUATORS_QUEUE,
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    quorum_queue_args.clone(),
                )
                .await
                .unwrap();

            // ==== 3.4 Payloads message queue ====
            channel
                .exchange_declare(
                    PAYLOADS_EXCHANGE,
                    ExchangeKind::Fanout,
                    ExchangeDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    FieldTable::default(),
                )
                .await
                .unwrap();

            channel
                .queue_declare(
                    PAYLOADS_QUEUE,
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    quorum_queue_args.clone(),
                )
                .await
                .unwrap();

            // ==== 3.5 Trace summary message queue ====
            channel
                .exchange_declare(
                    TRACE_SUMMARY_EXCHANGE,
                    ExchangeKind::Fanout,
                    ExchangeDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    FieldTable::default(),
                )
                .await
                .unwrap();

            channel
                .queue_declare(
                    TRACE_SUMMARY_QUEUE,
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    quorum_queue_args.clone(),
                )
                .await
                .unwrap();

            let max_channel_pool_size = env::var("RABBITMQ_MAX_CHANNEL_POOL_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(64);

            log::info!("RabbitMQ channels: {}", max_channel_pool_size);

            let rabbit_mq = mq::rabbit::RabbitMQ::new(
                publisher_conn.clone(),
                consumer_conn.clone(),
                max_channel_pool_size,
            );
            Arc::new(rabbit_mq.into())
        })
    } else {
        let queue = mq::tokio_mpsc::TokioMpscQueue::new();
        // register queues
        // ==== 3.1 Spans message queue ====
        queue.register_queue(OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE);
        // ==== 3.2 Browser events message queue ====
        queue.register_queue(BROWSER_SESSIONS_EXCHANGE, BROWSER_SESSIONS_QUEUE);
        // ==== 3.3 Evaluators message queue ====
        queue.register_queue(EVALUATORS_EXCHANGE, EVALUATORS_QUEUE);
        // ==== 3.4 Payloads message queue ====
        queue.register_queue(PAYLOADS_EXCHANGE, PAYLOADS_QUEUE);
        // ==== 3.5 Trace summary message queue ====
        queue.register_queue(TRACE_SUMMARY_EXCHANGE, TRACE_SUMMARY_QUEUE);
        log::info!("Using tokio mpsc queue");
        Arc::new(queue.into())
    };

    // ==== 3.6 Agent worker message queue ====
    let agent_manager_workers = Arc::new(AgentManagerWorkers::new());

    // ==== 3.6 SSE connections map ====
    let sse_connections: SseConnectionMap = Arc::new(dashmap::DashMap::new());

    runtime_handle.spawn(cleanup_closed_connections(sse_connections.clone()));

    let runtime_handle_for_http = runtime_handle.clone();
    let db_for_http = db.clone();
    let cache_for_http = cache.clone();
    let mq_for_http = queue.clone();

        // == Clickhouse ==
    let clickhouse_url =
        env::var("CLICKHOUSE_URL").expect("CLICKHOUSE_URL must be set");
    let clickhouse_user =
        env::var("CLICKHOUSE_USER").expect("CLICKHOUSE_USER must be set");
    let clickhouse_password = env::var("CLICKHOUSE_PASSWORD");
    let clickhouse_client = clickhouse::Client::default()
        .with_url(clickhouse_url.clone())
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
    let clickhouse_for_grpc = clickhouse.clone();

    // == Clickhouse Read-Only Client ==
    let clickhouse_readonly_client = if is_feature_enabled(Feature::ClickhouseReadOnly) {
        let clickhouse_ro_user = 
            env::var("CLICKHOUSE_RO_USER").expect("CLICKHOUSE_RO_USER must be set");
        let clickhouse_ro_password = env::var("CLICKHOUSE_RO_PASSWORD").expect("CLICKHOUSE_RO_PASSWORD must be set");
        
        Some(Arc::new(
            crate::sql::ClickhouseReadonlyClient::new(
                clickhouse_url,
                clickhouse_ro_user,
                clickhouse_ro_password,
            )
        ))
    } else {
        log::info!("ClickHouse read-only client disabled");
        None
    };

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
                        mq_for_http.clone(),
                    );
                    Arc::new(s3_storage.into())
                } else {
                    log::info!("using mock storage");
                    Arc::new(MockStorage {}.into())
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

                // == Evaluator client ==
                let evaluator_client = if is_feature_enabled(Feature::Evaluators) {
                    let online_evaluators_secret_key = env::var("ONLINE_EVALUATORS_SECRET_KEY").expect("ONLINE_EVALUATORS_SECRET_KEY must be set");
                    let mut headers = reqwest::header::HeaderMap::new();

                    headers.insert(
                        reqwest::header::AUTHORIZATION,
                        reqwest::header::HeaderValue::from_str(&format!("Bearer {}", online_evaluators_secret_key))
                            .expect("Invalid ONLINE_EVALUATORS_SECRET_KEY format")
                    );
                    headers.insert(
                        reqwest::header::CONTENT_TYPE,
                        reqwest::header::HeaderValue::from_static("application/json")
                    );

                    Arc::new(
                        reqwest::Client::builder()
                            .user_agent("lmnr-evaluator/1.0")
                            .default_headers(headers)
                            .build()
                            .expect("Failed to create evaluator HTTP client")
                    )
                } else {
                    log::info!("Using mock evaluator client");
                    Arc::new(
                        reqwest::Client::builder()
                        .user_agent("lmnr-evaluator-mock/1.0")
                        .build()
                        .expect("Failed to create mock evaluator HTTP client")
                    )
                };
    
                let python_online_evaluator_url: String = if is_feature_enabled(Feature::Evaluators) {
                    env::var("PYTHON_ONLINE_EVALUATOR_URL").expect("PYTHON_ONLINE_EVALUATOR_URL must be set")
                } else {
                    String::new()
                };

                // == Query Engine ==
                let query_engine: Arc<QueryEngine> = if is_feature_enabled(Feature::SqlQueryEngine) {
                    let query_engine_url = env::var("QUERY_ENGINE_URL").expect("QUERY_ENGINE_URL must be set");
                    let query_engine_grpc_client = Arc::new(
                        QueryEngineServiceClient::connect(query_engine_url)
                            .await
                            .map_err(tonic_error_to_io_error)?
                    );
                    Arc::new(QueryEngineImpl::new(query_engine_grpc_client).into())
                } else {
                    log::info!("Using mock query engine");
                    Arc::new(query_engine::mock::MockQueryEngine {}.into())
                };

                let num_spans_workers_per_thread = env::var("NUM_SPANS_WORKERS_PER_THREAD")
                    .unwrap_or(String::from("4"))
                    .parse::<u8>()
                    .unwrap_or(4);

                let num_browser_events_workers_per_thread =
                    env::var("NUM_BROWSER_EVENTS_WORKERS_PER_THREAD")
                        .unwrap_or(String::from("4"))
                        .parse::<u8>()
                        .unwrap_or(4);

                let num_evaluators_workers_per_thread =
                    env::var("NUM_EVALUATORS_WORKERS_PER_THREAD")
                        .unwrap_or(String::from("4"))
                        .parse::<u8>()
                        .unwrap_or(4);

                let num_payload_workers_per_thread =
                    env::var("NUM_PAYLOAD_WORKERS_PER_THREAD")
                        .unwrap_or(String::from("2"))
                        .parse::<u8>()
                        .unwrap_or(2);

                let num_trace_summary_workers_per_thread =
                    env::var("NUM_TRACE_SUMMARY_WORKERS_PER_THREAD")
                        .unwrap_or(String::from("2"))
                        .parse::<u8>()
                        .unwrap_or(2);

                log::info!(
                    "Spans workers per thread: {}, Browser events workers per thread: {}, Evaluators workers per thread: {}, Payload workers per thread: {}, Trace summary workers per thread: {}",
                    num_spans_workers_per_thread,
                    num_browser_events_workers_per_thread,
                    num_evaluators_workers_per_thread,
                    num_payload_workers_per_thread,
                    num_trace_summary_workers_per_thread
                );

                HttpServer::new(move || {
                    let project_auth = HttpAuthentication::bearer(auth::project_validator);

                    for _ in 0..num_spans_workers_per_thread {
                        tokio::spawn(process_queue_spans(
                            db_for_http.clone(),
                            cache_for_http.clone(),
                            mq_for_http.clone(),
                            clickhouse.clone(),
                            storage.clone(),
                            sse_connections.clone(),
                        ));
                    }

                    for _ in 0..num_browser_events_workers_per_thread {
                        tokio::spawn(process_browser_events(
                            db_for_http.clone(),
                            clickhouse.clone(),
                            cache_for_http.clone(),
                            mq_for_http.clone(),
                        ));
                    }

                    for _ in 0..num_evaluators_workers_per_thread {
                        tokio::spawn(process_evaluators(
                            db_for_http.clone(),
                            clickhouse.clone(),
                            mq_for_http.clone(),
                            evaluator_client.clone(),
                            python_online_evaluator_url.clone(),
                        ));
                    }

                    for _ in 0..num_payload_workers_per_thread {
                        tokio::spawn(process_payloads(
                            storage.clone(),
                            mq_for_http.clone(),
                        ));
                    }

                    for _ in 0..num_trace_summary_workers_per_thread {
                        tokio::spawn(process_trace_summaries(
                            db_for_http.clone(),
                            cache_for_http.clone(),
                            mq_for_http.clone(),
                        ));
                    }

                    App::new()
                        .wrap( ErrorHandlers::new()
                            .handler(StatusCode::BAD_REQUEST, |res: dev::ServiceResponse| {
                                log::error!("Bad request: {:?}", res.response().body());
                                Ok(ErrorHandlerResponse::Response(res.map_into_left_body()))
                            })
                        )
                        .wrap(Logger::default().exclude("/health").exclude("/ready"))
                        .wrap(NormalizePath::trim())
                        .app_data(JsonConfig::default().limit(http_payload_limit))
                        .app_data(PayloadConfig::new(http_payload_limit))
                        .app_data(web::Data::from(cache_for_http.clone()))
                        .app_data(web::Data::from(db_for_http.clone()))
                        .app_data(web::Data::new(mq_for_http.clone()))
                        .app_data(web::Data::new(clickhouse.clone()))
                        .app_data(web::Data::new(clickhouse_readonly_client.clone()))
                        .app_data(web::Data::new(name_generator.clone()))
                        .app_data(web::Data::new(storage.clone()))
                        .app_data(web::Data::new(agent_manager_workers.clone()))
                        .app_data(web::Data::new(connection_for_health.clone()))
                        .app_data(web::Data::new(browser_agent.clone()))
                        .app_data(web::Data::new(query_engine.clone()))
                        .app_data(web::Data::new(sse_connections.clone()))
                        .service(
                            web::scope("/v1/browser-sessions")
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
                                .service(api::v1::datasets::create_datapoints)
                                .service(api::v1::datasets::get_parquet)
                                .service(api::v1::metrics::process_metrics)
                                .service(api::v1::browser_sessions::create_session_event)
                                .service(api::v1::evals::init_eval)
                                .service(api::v1::evals::save_eval_datapoints)
                                .service(api::v1::evals::update_eval_datapoint)
                                .service(api::v1::evaluators::create_evaluator_score)
                                .service(api::v1::tag::tag_trace)
                                .service(api::v1::agent::run_agent_manager)
                                .service(api::v1::sql::execute_sql_query)
                                .service(api::v1::payloads::get_payload),
                        )
                        .service(
                            // auth on path projects/{project_id} is handled by middleware on Next.js
                            web::scope("/api/v1/projects/{project_id}")
                                .service(routes::api_keys::create_project_api_key)
                                .service(routes::api_keys::get_api_keys_for_project)
                                .service(routes::api_keys::revoke_project_api_key)
                                .service(routes::evaluations::get_evaluation_score_stats)
                                .service(routes::evaluations::get_evaluation_score_distribution)
                                .service(routes::provider_api_keys::save_api_key)
                                .service(routes::spans::create_span)
                                .service(routes::sql::execute_sql_query)
                                .service(routes::sql::validate_sql_query)
                                .service(routes::realtime::sse_endpoint),
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
                    clickhouse_for_grpc,
                    queue.clone(),
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
