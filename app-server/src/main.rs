#[cfg(not(target_env = "msvc"))]
use tikv_jemallocator::Jemalloc;

#[cfg(not(target_env = "msvc"))]
#[global_allocator]
static GLOBAL: Jemalloc = Jemalloc;

use actix_web::{
    App, HttpServer, dev,
    http::StatusCode,
    middleware::{ErrorHandlerResponse, ErrorHandlers, Logger, NormalizePath},
    web::{self, JsonConfig, PayloadConfig},
};
use actix_web_httpauth::middleware::HttpAuthentication;
use api::v1::browser_sessions::{
    BROWSER_SESSIONS_EXCHANGE, BROWSER_SESSIONS_QUEUE, BROWSER_SESSIONS_ROUTING_KEY,
};
use aws_config::BehaviorVersion;
use browser_events::BrowserEventHandler;
use evaluators::{EVALUATORS_EXCHANGE, EVALUATORS_QUEUE, EVALUATORS_ROUTING_KEY, EvaluatorHandler};
use features::{Feature, is_feature_enabled};
use lapin::{
    Connection, ConnectionProperties, ExchangeKind,
    options::{ExchangeDeclareOptions, QueueDeclareOptions},
    types::FieldTable,
};
use mq::MessageQueue;
use names::NameGenerator;
use notifications::{
    NOTIFICATIONS_EXCHANGE, NOTIFICATIONS_QUEUE, NOTIFICATIONS_ROUTING_KEY, NotificationHandler,
};
use opentelemetry_proto::opentelemetry::proto::collector::trace::v1::trace_service_server::TraceServiceServer;
use query_engine::{
    QueryEngine, query_engine::query_engine_service_client::QueryEngineServiceClient,
    query_engine_impl::QueryEngineImpl,
};
use runtime::{create_general_purpose_runtime, wait_stop_signal};
use tonic::transport::Server;
use trace_analysis::{
    TRACE_ANALYSIS_LLM_BATCH_PENDING_EXCHANGE, TRACE_ANALYSIS_LLM_BATCH_PENDING_QUEUE,
    TRACE_ANALYSIS_LLM_BATCH_PENDING_ROUTING_KEY, TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_EXCHANGE,
    TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_QUEUE, TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_ROUTING_KEY,
    pendings_consumer::LLMBatchPendingHandler, submissions_consumer::LLMBatchSubmissionsHandler,
};
use traces::{
    EVENT_CLUSTERING_EXCHANGE, EVENT_CLUSTERING_QUEUE, EVENT_CLUSTERING_ROUTING_KEY,
    OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE, OBSERVATIONS_ROUTING_KEY, SEMANTIC_EVENT_EXCHANGE,
    SEMANTIC_EVENT_QUEUE, SEMANTIC_EVENT_ROUTING_KEY, clustering::ClusteringHandler,
    consumer::SpanHandler, grpc_service::ProcessTracesService,
    semantic_events::SemanticEventHandler,
};

use cache::{Cache, in_memory::InMemoryCache, redis::RedisCache};
use pubsub::{PubSub, in_memory::InMemoryPubSub, redis::RedisPubSub};
use quickwit::{
    SPANS_INDEXER_EXCHANGE, SPANS_INDEXER_QUEUE, SPANS_INDEXER_ROUTING_KEY,
    client::{QuickwitClient, QuickwitConfig},
    consumer::QuickwitIndexerHandler,
};
use realtime::SseConnectionMap;
use sodiumoxide;
use std::{
    borrow::Cow,
    env,
    io::{self, Error},
    sync::Arc,
    thread::{self, JoinHandle},
};
use storage::{
    PAYLOADS_EXCHANGE, PAYLOADS_QUEUE, PAYLOADS_ROUTING_KEY, PayloadHandler, Storage,
    mock::MockStorage,
};

use crate::features::{enable_consumer, enable_producer};
use crate::worker::{QueueConfig, WorkerPool, WorkerType};

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
mod instrumentation;
mod language_model;
mod mq;
mod names;
mod notifications;
mod opentelemetry_proto;
mod project_api_keys;
mod pubsub;
mod query_engine;
mod quickwit;
mod realtime;
mod routes;
mod runtime;
mod sql;
mod storage;
mod trace_analysis;
mod traces;
mod utils;
mod worker;

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
    let sentry_dsn =
        env::var("SENTRY_DSN").unwrap_or("https://1234567890@sentry.io/1234567890".to_string());
    let _sentry_guard = sentry::init((
        sentry_dsn,
        sentry::ClientOptions {
            release: sentry::release_name!(),
            traces_sample_rate: 1.0,
            environment: Some(Cow::Owned(
                env::var("ENVIRONMENT").unwrap_or("development".to_string()),
            )),
            before_send: Some(Arc::new(|_| {
                // We don't want Sentry to record events. We only use it for OTel tracing.
                None
            })),
            ..Default::default()
        },
    ));

    if !is_feature_enabled(Feature::Tracing) || env::var("SENTRY_DSN").is_err() {
        // If tracing is not enabled, drop the sentry guard, thus disabling sentry
        drop(_sentry_guard);
    }

    instrumentation::setup_tracing(is_feature_enabled(Feature::Tracing));

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
        .unwrap_or(8000);

    let grpc_port: u16 = env::var("GRPC_PORT")
        .unwrap_or(String::from("8001"))
        .parse()
        .unwrap_or(8001);

    // Default to the port 8002. Usually is different from the HTTP and gRPC ports,
    // to avoid conflicts, when producer and consumer are run on the same machine
    // in the dual mode.
    let consumer_port: u16 = env::var("CONSUMER_PORT")
        .unwrap_or(String::from("8002"))
        .parse()
        .unwrap_or(8002);

    let grpc_address = format!("0.0.0.0:{}", grpc_port).parse().unwrap();

    // == Stuff that is needed both for HTTP and gRPC servers ==
    // === 1. Redis client (shared for cache and pub/sub) ===
    let redis_client = if let Ok(redis_url) = env::var("REDIS_URL") {
        log::info!("Initializing Redis client");
        match redis::Client::open(redis_url.as_str()) {
            Ok(client) => Some(Arc::new(client)),
            Err(e) => {
                log::warn!("Failed to create Redis client: {:?}", e);
                None
            }
        }
    } else {
        log::info!("REDIS_URL not set");
        None
    };

    // === 2. Cache ===
    let cache = if let Some(ref client) = redis_client {
        log::info!("Using Redis cache");
        runtime_handle.block_on(async {
            let redis_cache = RedisCache::new(client).await.unwrap();
            Cache::Redis(redis_cache)
        })
    } else {
        log::info!("Using in-memory cache");
        Cache::InMemory(InMemoryCache::new(None))
    };
    let cache = Arc::new(cache);

    // === 3. Pub/Sub ===
    let pubsub = if let Some(ref client) = redis_client {
        log::info!("Using Redis pub/sub");
        PubSub::Redis(runtime_handle.block_on(RedisPubSub::new(client)).unwrap())
    } else {
        log::info!("Using in-memory pub/sub");
        PubSub::InMemory(InMemoryPubSub::new())
    };
    let pubsub = Arc::new(pubsub);

    // === 4. Database ===
    let inner_db = runtime_handle.block_on(db::DB::connect_from_env())?;
    let db = Arc::new(inner_db);

    // === 3. Message queues ===
    // Only enable RabbitMQ if it is a full build and RabbitMQ Feature (URL) is set
    // Create publisher connection always (needed for both modes)
    // Create consumer connection only if consumer mode is enabled
    let (publisher_connection, consumer_connection) =
        if is_feature_enabled(Feature::RabbitMQ) && is_feature_enabled(Feature::FullBuild) {
            let rabbitmq_url = env::var("RABBITMQ_URL").expect("RABBITMQ_URL must be set");
            runtime_handle.block_on(async {
                let publisher_conn = Arc::new(
                    Connection::connect(&rabbitmq_url, ConnectionProperties::default())
                        .await
                        .unwrap(),
                );

                // Only create consumer connection if consumer mode is enabled
                let consumer_conn = if enable_consumer() {
                    log::info!("Consumer mode enabled - creating consumer connection");
                    Some(Arc::new(
                        Connection::connect(&rabbitmq_url, ConnectionProperties::default())
                            .await
                            .unwrap(),
                    ))
                } else {
                    log::info!("Producer-only mode - skipping consumer connection");
                    None
                };

                (Some(publisher_conn), consumer_conn)
            })
        } else {
            (None, None)
        };

    let queue: Arc<MessageQueue> = if let Some(publisher_conn) = publisher_connection.as_ref() {
        runtime_handle.block_on(async {
            let channel = publisher_conn.create_channel().await.unwrap();

            // Create quorum queue arguments (reused for all queues)
            let mut quorum_queue_args = FieldTable::default();
            quorum_queue_args.insert(
                "x-queue-type".into(),
                lapin::types::AMQPValue::LongString("quorum".into()),
            );

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

            // ==== 3.1b Spans indexer message queue ====
            channel
                .exchange_declare(
                    SPANS_INDEXER_EXCHANGE,
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
                    SPANS_INDEXER_QUEUE,
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

            // ==== 3.5 Semantic event message queue ====
            channel
                .exchange_declare(
                    SEMANTIC_EVENT_EXCHANGE,
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
                    SEMANTIC_EVENT_QUEUE,
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    quorum_queue_args.clone(),
                )
                .await
                .unwrap();

            // ==== 3.6 Notifications message queue ====
            channel
                .exchange_declare(
                    NOTIFICATIONS_EXCHANGE,
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
                    NOTIFICATIONS_QUEUE,
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    quorum_queue_args.clone(),
                )
                .await
                .unwrap();

            // ==== 3.7 Event Clustering message queue ====
            channel
                .exchange_declare(
                    EVENT_CLUSTERING_EXCHANGE,
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
                    EVENT_CLUSTERING_QUEUE,
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    quorum_queue_args.clone(),
                )
                .await
                .unwrap();

            // ==== 3.8 Trace Analysis LLM Batch Submissions message queue ====
            channel
                .exchange_declare(
                    TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_EXCHANGE,
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
                    TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_QUEUE,
                    QueueDeclareOptions {
                        durable: true,
                        ..Default::default()
                    },
                    quorum_queue_args.clone(),
                )
                .await
                .unwrap();

            // ==== 3.9 Trace Analysis LLM Batch Pending message queue ====
            channel
                .exchange_declare(
                    TRACE_ANALYSIS_LLM_BATCH_PENDING_EXCHANGE,
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
                    TRACE_ANALYSIS_LLM_BATCH_PENDING_QUEUE,
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
                consumer_connection.clone(),
                max_channel_pool_size,
            );
            Arc::new(rabbit_mq.into())
        })
    } else {
        let queue = mq::tokio_mpsc::TokioMpscQueue::new();
        // register queues
        // ==== 3.1 Spans message queue ====
        queue.register_queue(OBSERVATIONS_EXCHANGE, OBSERVATIONS_QUEUE);
        // ==== 3.1b Spans indexer message queue ====
        queue.register_queue(SPANS_INDEXER_EXCHANGE, SPANS_INDEXER_QUEUE);
        // ==== 3.2 Browser events message queue ====
        queue.register_queue(BROWSER_SESSIONS_EXCHANGE, BROWSER_SESSIONS_QUEUE);
        // ==== 3.3 Evaluators message queue ====
        queue.register_queue(EVALUATORS_EXCHANGE, EVALUATORS_QUEUE);
        // ==== 3.4 Payloads message queue ====
        queue.register_queue(PAYLOADS_EXCHANGE, PAYLOADS_QUEUE);
        // ==== 3.5 Semantic event message queue ====
        queue.register_queue(SEMANTIC_EVENT_EXCHANGE, SEMANTIC_EVENT_QUEUE);
        // ==== 3.6 Notifications message queue ====
        queue.register_queue(NOTIFICATIONS_EXCHANGE, NOTIFICATIONS_QUEUE);
        // ==== 3.7 Event Clustering message queue ====
        queue.register_queue(EVENT_CLUSTERING_EXCHANGE, EVENT_CLUSTERING_QUEUE);
        log::info!("Using tokio mpsc queue");
        Arc::new(queue.into())
    };

    // ==== 3.5 SSE connections map ====
    let sse_connections: SseConnectionMap = Arc::new(dashmap::DashMap::new());

    let sse_connections_clone = sse_connections.clone();
    let pubsub_clone = pubsub.clone();
    runtime_handle.spawn(async move {
        if let Err(e) = realtime::start_redis_subscriber(pubsub_clone, sse_connections_clone).await
        {
            log::error!("Redis SSE subscriber failed: {:?}", e);
        }
    });

    let runtime_handle_for_http = runtime_handle.clone();
    let db_for_http = db.clone();
    let cache_for_http = cache.clone();
    let mq_for_http = queue.clone();

    // == AWS config for S3 ==
    let aws_sdk_config = runtime_handle.block_on(async {
        aws_config::defaults(BehaviorVersion::latest())
            .region(aws_config::Region::new(
                env::var("AWS_REGION").unwrap_or("us-east-1".to_string()),
            ))
            .load()
            .await
    });

    // == Storage ==
    let storage: Arc<Storage> = if is_feature_enabled(Feature::Storage) {
        log::info!("using S3 storage");
        let s3_client = aws_sdk_s3::Client::new(&aws_sdk_config);
        let s3_storage = storage::s3::S3Storage::new(s3_client, queue.clone());
        Arc::new(s3_storage.into())
    } else {
        log::info!("using mock storage");
        Arc::new(MockStorage {}.into())
    };

    // == Query engine ==
    let query_engine: Arc<QueryEngine> = if is_feature_enabled(Feature::SqlQueryEngine) {
        let query_engine_url = env::var("QUERY_ENGINE_URL").expect("QUERY_ENGINE_URL must be set");
        runtime_handle.block_on(async {
            let query_engine_grpc_client = Arc::new(
                QueryEngineServiceClient::connect(query_engine_url)
                    .await
                    .map_err(tonic_error_to_io_error)?,
            );
            Ok::<_, io::Error>(Arc::new(
                QueryEngineImpl::new(query_engine_grpc_client).into(),
            ))
        })?
    } else {
        log::info!("Using mock query engine");
        Arc::new(query_engine::mock::MockQueryEngine {}.into())
    };

    // == Clickhouse ==
    let clickhouse_url = env::var("CLICKHOUSE_URL").expect("CLICKHOUSE_URL must be set");
    let clickhouse_user = env::var("CLICKHOUSE_USER").expect("CLICKHOUSE_USER must be set");
    let clickhouse_password = env::var("CLICKHOUSE_PASSWORD");
    let clickhouse_client = clickhouse::Client::default()
        .with_url(clickhouse_url.clone())
        .with_user(clickhouse_user)
        .with_database("default")
        // Validation switches the write format from RowBinary to RowBinaryWithNamesAndTypes.
        // https://clickhouse.com/docs/interfaces/formats/RowBinaryWithNamesAndTypes
        //
        // Disable validation globally, because:
        // 1. Type safety in clickhouse is a little more relaxed than in other databases.
        //    For example, columns don't have to have explicit default values, while validation
        //    requires unused columns to be present in each write.
        // 2. For the examples like above, validation makes schema updates harder,
        //    because we need to update all writes to the table, for the cases where
        //    validation in code breaks, while clickhouse permits the writes.
        //    Moreover, code updates need to be done at the same time as the schema update.
        // 3. Validation is costly. It can slow down writes by 1.1-3x according to the
        //    crate doc comments.
        // 4. Rust types themselves are a bit more strict. For example, `data` in `BrowserEventCHRow`
        //    is `&'a [u8]`, but the column is `String`. The underlying data is not a valid UTF-8 string,
        //    but it's still a valid binary data. Rust will refuse to create a String from it, while
        //    the validation in the SDK would require us to make it a String
        .with_validation(false)
        .with_option("async_insert", "1")
        .with_option("wait_for_async_insert", "1");

    let clickhouse = match clickhouse_password {
        Ok(password) => clickhouse_client.with_password(password),
        _ => {
            log::warn!("CLICKHOUSE_PASSWORD not set, using without password");
            clickhouse_client
        }
    };

    // == Clickhouse Read-Only Client ==
    let clickhouse_readonly_client = if is_feature_enabled(Feature::ClickhouseReadOnly) {
        let clickhouse_ro_user =
            env::var("CLICKHOUSE_RO_USER").expect("CLICKHOUSE_RO_USER must be set");
        let clickhouse_ro_password =
            env::var("CLICKHOUSE_RO_PASSWORD").expect("CLICKHOUSE_RO_PASSWORD must be set");

        Some(Arc::new(crate::sql::ClickhouseReadonlyClient::new(
            clickhouse_url,
            clickhouse_ro_user,
            clickhouse_ro_password,
        )))
    } else {
        log::info!("ClickHouse read-only client disabled");
        None
    };

    // == Quickwit ==
    // Quickwit is optional - if unavailable, the server will start but search/indexing will be disabled
    let quickwit_client =
        match runtime_handle.block_on(QuickwitClient::connect(QuickwitConfig::from_env())) {
            Ok(client) => {
                log::info!("Quickwit client connected successfully");
                Some(client)
            }
            Err(e) => {
                log::warn!(
                    "Failed to connect to Quickwit (search/indexing will be disabled): {:?}",
                    e
                );
                None
            }
        };

    // == HTTP client ==
    let http_client = reqwest::Client::new();

    let clickhouse_for_http = clickhouse.clone();
    let storage_for_http = storage.clone();
    let sse_connections_for_http = sse_connections.clone();

    if !enable_producer() && !enable_consumer() {
        log::error!(
            "Neither producer nor consumer mode is enabled. Set OPERATION_MODE to 'producer' or 'consumer', or unset to run both"
        );
        return Err(anyhow::anyhow!(
            "Neither producer nor consumer mode is enabled"
        ));
    }

    if enable_consumer() {
        log::info!("Enabling consumer mode, spinning up queue workers");

        let worker_pool = Arc::new(WorkerPool::new(queue.clone()));

        // == Evaluator client ==
        let evaluator_client = if is_feature_enabled(Feature::Evaluators) {
            let online_evaluators_secret_key = env::var("ONLINE_EVALUATORS_SECRET_KEY")
                .expect("ONLINE_EVALUATORS_SECRET_KEY must be set");
            let mut headers = reqwest::header::HeaderMap::new();

            headers.insert(
                reqwest::header::AUTHORIZATION,
                reqwest::header::HeaderValue::from_str(&format!(
                    "Bearer {}",
                    online_evaluators_secret_key
                ))
                .expect("Invalid ONLINE_EVALUATORS_SECRET_KEY format"),
            );
            headers.insert(
                reqwest::header::CONTENT_TYPE,
                reqwest::header::HeaderValue::from_static("application/json"),
            );

            Arc::new(
                reqwest::Client::builder()
                    .user_agent("lmnr-evaluator/1.0")
                    .default_headers(headers)
                    .build()
                    .expect("Failed to create evaluator HTTP client"),
            )
        } else {
            log::info!("Using mock evaluator client");
            Arc::new(
                reqwest::Client::builder()
                    .user_agent("lmnr-evaluator-mock/1.0")
                    .build()
                    .expect("Failed to create mock evaluator HTTP client"),
            )
        };

        // == Gemini client ==
        let gemini_client = if is_feature_enabled(Feature::TraceAnalysis) {
            log::info!("Initializing Gemini client for trace analysis");
            match trace_analysis::gemini::GeminiClient::new() {
                Ok(client) => Some(Arc::new(client)),
                Err(e) => {
                    log::warn!(
                        "Failed to create Gemini client (trace analysis will be disabled): {:?}",
                        e
                    );
                    None
                }
            }
        } else {
            log::info!("Trace analysis feature disabled - skipping Gemini client initialization");
            None
        };

        let python_online_evaluator_url: String = if is_feature_enabled(Feature::Evaluators) {
            env::var("PYTHON_ONLINE_EVALUATOR_URL")
                .expect("PYTHON_ONLINE_EVALUATOR_URL must be set")
        } else {
            String::new()
        };

        let num_spans_workers = env::var("NUM_SPANS_WORKERS")
            .unwrap_or(String::from("4"))
            .parse::<u8>()
            .unwrap_or(4);

        let num_spans_indexer_workers = env::var("NUM_SPANS_INDEXER_WORKERS")
            .unwrap_or(String::from("4"))
            .parse::<u8>()
            .unwrap_or(4);

        let num_browser_events_workers = env::var("NUM_BROWSER_EVENTS_WORKERS")
            .unwrap_or(String::from("4"))
            .parse::<u8>()
            .unwrap_or(4);

        let num_evaluators_workers = env::var("NUM_EVALUATORS_WORKERS")
            .unwrap_or(String::from("2"))
            .parse::<u8>()
            .unwrap_or(2);

        let num_payload_workers = env::var("NUM_PAYLOAD_WORKERS")
            .unwrap_or(String::from("2"))
            .parse::<u8>()
            .unwrap_or(2);

        let num_semantic_event_workers = env::var("NUM_SEMANTIC_EVENT_WORKERS")
            .unwrap_or(String::from("2"))
            .parse::<u8>()
            .unwrap_or(2);

        let num_notification_workers = env::var("NUM_NOTIFICATION_WORKERS")
            .unwrap_or(String::from("2"))
            .parse::<u8>()
            .unwrap_or(2);

        let num_clustering_workers = env::var("NUM_CLUSTERING_WORKERS")
            .unwrap_or(String::from("2"))
            .parse::<u8>()
            .unwrap_or(2);

        let num_trace_analysis_llm_batch_submissions_workers =
            env::var("NUM_TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_WORKERS")
                .unwrap_or(String::from("4"))
                .parse::<u8>()
                .unwrap_or(4);

        let num_trace_analysis_llm_batch_pending_workers =
            env::var("NUM_TRACE_ANALYSIS_LLM_BATCH_PENDING_WORKERS")
                .unwrap_or(String::from("4"))
                .parse::<u8>()
                .unwrap_or(4);

        log::info!(
            "Spans workers: {}, Spans indexer workers: {}, Browser events workers: {}, Evaluators workers: {}, Payload workers: {}, Semantic event workers: {}, Notification workers: {}, Clustering workers: {}, Trace Analysis LLM Batch Submissions workers: {}, Trace Analysis LLM Batch Pending workers: {}",
            num_spans_workers,
            num_spans_indexer_workers,
            num_browser_events_workers,
            num_evaluators_workers,
            num_payload_workers,
            num_semantic_event_workers,
            num_notification_workers,
            num_clustering_workers,
            num_trace_analysis_llm_batch_submissions_workers,
            num_trace_analysis_llm_batch_pending_workers
        );

        let queue_for_health = mq_for_http.clone();
        let runtime_handle_for_consumer = runtime_handle_for_http.clone();
        let db_for_consumer = db_for_http.clone();
        let cache_for_consumer = cache_for_http.clone();
        let mq_for_consumer = mq_for_http.clone();
        let clickhouse_for_consumer = clickhouse.clone();
        let http_client_for_consumer = http_client.clone();
        let storage_for_consumer = storage.clone();
        let quickwit_client_for_consumer = quickwit_client.clone();
        let pubsub_for_consumer = pubsub.clone();
        let worker_pool_clone = worker_pool.clone();

        let consumer_handle = thread::Builder::new()
            .name("consumer".to_string())
            .spawn(move || {
                runtime_handle_for_consumer.block_on(async {
                    // Spawn spans workers using new worker pool
                    {
                        let db = db_for_consumer.clone();
                        let cache = cache_for_consumer.clone();
                        let queue = mq_for_consumer.clone();
                        let clickhouse = clickhouse_for_consumer.clone();
                        let storage = storage_for_consumer.clone();
                        let pubsub = pubsub_for_consumer.clone();

                        worker_pool_clone.spawn(
                            WorkerType::Spans,
                            num_spans_workers as usize,
                            move || SpanHandler {
                                db: db.clone(),
                                cache: cache.clone(),
                                queue: queue.clone(),
                                clickhouse: clickhouse.clone(),
                                storage: storage.clone(),
                                pubsub: pubsub.clone(),
                            },
                            QueueConfig {
                                queue_name: OBSERVATIONS_QUEUE,
                                exchange_name: OBSERVATIONS_EXCHANGE,
                                routing_key: OBSERVATIONS_ROUTING_KEY,
                            },
                        );
                    }

                    // Spawn spans indexer workers if Quickwit is available
                    if let Some(quickwit_client_for_indexer) = quickwit_client_for_consumer.as_ref()
                    {
                        let quickwit = quickwit_client_for_indexer.clone();
                        worker_pool_clone.spawn(
                            WorkerType::SpansIndexer,
                            num_spans_indexer_workers as usize,
                            move || QuickwitIndexerHandler {
                                quickwit_client: quickwit.clone(),
                            },
                            QueueConfig {
                                queue_name: SPANS_INDEXER_QUEUE,
                                exchange_name: SPANS_INDEXER_EXCHANGE,
                                routing_key: SPANS_INDEXER_ROUTING_KEY,
                            },
                        );
                    } else {
                        log::warn!("Quickwit not available - skipping spans indexer workers");
                    }

                    // Spawn browser events workers
                    {
                        let db = db_for_consumer.clone();
                        let clickhouse = clickhouse_for_consumer.clone();
                        let cache = cache_for_consumer.clone();
                        worker_pool_clone.spawn(
                            WorkerType::BrowserEvents,
                            num_browser_events_workers as usize,
                            move || BrowserEventHandler {
                                db: db.clone(),
                                clickhouse: clickhouse.clone(),
                                cache: cache.clone(),
                            },
                            QueueConfig {
                                queue_name: BROWSER_SESSIONS_QUEUE,
                                exchange_name: BROWSER_SESSIONS_EXCHANGE,
                                routing_key: BROWSER_SESSIONS_ROUTING_KEY,
                            },
                        );
                    }

                    // Spawn evaluators workers
                    {
                        let db = db_for_consumer.clone();
                        let clickhouse = clickhouse_for_consumer.clone();
                        let client = evaluator_client.clone();
                        let python_url = python_online_evaluator_url.clone();
                        worker_pool_clone.spawn(
                            WorkerType::Evaluators,
                            num_evaluators_workers as usize,
                            move || EvaluatorHandler {
                                db: db.clone(),
                                clickhouse: clickhouse.clone(),
                                client: client.clone(),
                                python_online_evaluator_url: python_url.clone(),
                            },
                            QueueConfig {
                                queue_name: EVALUATORS_QUEUE,
                                exchange_name: EVALUATORS_EXCHANGE,
                                routing_key: EVALUATORS_ROUTING_KEY,
                            },
                        );
                    }

                    // Spawn payload workers
                    {
                        let storage = storage.clone();
                        worker_pool_clone.spawn(
                            WorkerType::Payloads,
                            num_payload_workers as usize,
                            move || PayloadHandler {
                                storage: storage.clone(),
                            },
                            QueueConfig {
                                queue_name: PAYLOADS_QUEUE,
                                exchange_name: PAYLOADS_EXCHANGE,
                                routing_key: PAYLOADS_ROUTING_KEY,
                            },
                        );
                    }

                    // Spawn semantic event workers using new worker pool
                    {
                        let db = db_for_consumer.clone();
                        let queue = mq_for_consumer.clone();
                        let client = reqwest::Client::new();
                        let clickhouse = clickhouse_for_consumer.clone();
                        worker_pool_clone.spawn(
                            WorkerType::SemanticEvents,
                            num_semantic_event_workers as usize,
                            move || {
                                SemanticEventHandler::new(
                                    db.clone(),
                                    queue.clone(),
                                    clickhouse.clone(),
                                    client.clone(),
                                )
                            },
                            QueueConfig {
                                queue_name: SEMANTIC_EVENT_QUEUE,
                                exchange_name: SEMANTIC_EVENT_EXCHANGE,
                                routing_key: SEMANTIC_EVENT_ROUTING_KEY,
                            },
                        );
                    }

                    // Spawn notification workers
                    {
                        let db = db_for_consumer.clone();
                        let client = reqwest::Client::new();

                        worker_pool_clone.spawn(
                            WorkerType::Notifications,
                            num_notification_workers as usize,
                            move || NotificationHandler::new(db.clone(), client.clone()),
                            QueueConfig {
                                queue_name: NOTIFICATIONS_QUEUE,
                                exchange_name: NOTIFICATIONS_EXCHANGE,
                                routing_key: NOTIFICATIONS_ROUTING_KEY,
                            },
                        );
                    }

                    // Spawn clustering workers using new worker pool
                    {
                        let cache = cache_for_consumer.clone();
                        let client = reqwest::Client::new();
                        worker_pool_clone.spawn(
                            WorkerType::Clustering,
                            num_clustering_workers as usize,
                            move || ClusteringHandler::new(cache.clone(), client.clone()),
                            QueueConfig {
                                queue_name: EVENT_CLUSTERING_QUEUE,
                                exchange_name: EVENT_CLUSTERING_EXCHANGE,
                                routing_key: EVENT_CLUSTERING_ROUTING_KEY,
                            },
                        );
                    }

                    // Spawn LLM batch submissions workers
                    if let Some(gemini) = gemini_client.as_ref() {
                        let db = db_for_consumer.clone();
                        let queue = mq_for_consumer.clone();
                        let clickhouse = clickhouse_for_consumer.clone();
                        let gemini_clone = gemini.clone();
                        worker_pool_clone.spawn(
                            WorkerType::LLMBatchSubmissions,
                            num_trace_analysis_llm_batch_submissions_workers as usize,
                            move || {
                                LLMBatchSubmissionsHandler::new(
                                    db.clone(),
                                    queue.clone(),
                                    clickhouse.clone(),
                                    gemini_clone.clone(),
                                )
                            },
                            QueueConfig {
                                queue_name: TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_QUEUE,
                                exchange_name: TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_EXCHANGE,
                                routing_key: TRACE_ANALYSIS_LLM_BATCH_SUBMISSIONS_ROUTING_KEY,
                            },
                        );
                    } else {
                        log::warn!(
                            "Gemini client not available - skipping LLM batch submissions workers"
                        );
                    }

                    // Spawn LLM batch pending workers
                    if let Some(gemini) = gemini_client.as_ref() {
                        let db = db_for_consumer.clone();
                        let queue = mq_for_consumer.clone();
                        let clickhouse = clickhouse_for_consumer.clone();
                        let gemini_clone = gemini.clone();
                        worker_pool_clone.spawn(
                            WorkerType::LLMBatchPending,
                            num_trace_analysis_llm_batch_pending_workers as usize,
                            move || {
                                LLMBatchPendingHandler::new(
                                    db.clone(),
                                    queue.clone(),
                                    clickhouse.clone(),
                                    gemini_clone.clone(),
                                )
                            },
                            QueueConfig {
                                queue_name: TRACE_ANALYSIS_LLM_BATCH_PENDING_QUEUE,
                                exchange_name: TRACE_ANALYSIS_LLM_BATCH_PENDING_EXCHANGE,
                                routing_key: TRACE_ANALYSIS_LLM_BATCH_PENDING_ROUTING_KEY,
                            },
                        );
                    } else {
                        log::warn!(
                            "Gemini client not available - skipping LLM batch submissions workers"
                        );
                    }

                    HttpServer::new(move || {
                        App::new()
                            .wrap(NormalizePath::trim())
                            .app_data(web::Data::new(queue_for_health.clone()))
                            .app_data(web::Data::new(worker_pool_clone.clone()))
                            .app_data(web::Data::new(sse_connections.clone()))
                            .service(routes::probes::check_ready)
                            .service(routes::probes::check_health)
                            .service(
                                // auth on path projects/{project_id} is handled by middleware on Next.js
                                web::scope("/api/v1/projects/{project_id}")
                                    .service(routes::realtime::sse_endpoint),
                            )
                    })
                    .bind(("0.0.0.0", consumer_port))?
                    .run()
                    .await
                })
            })
            .unwrap();
        handles.push(consumer_handle);
    }

    if enable_producer() {
        log::info!("Enabling producer mode, spinning up full HTTP and gRPC servers");
        // == HTTP server and listener workers ==
        let http_server_handle = thread::Builder::new()
            .name("http".to_string())
            .spawn(move || {
                runtime_handle_for_http.block_on(async {
                    // == Name generator ==
                    let name_generator = Arc::new(NameGenerator::new());

                    log::info!("Spinning up full HTTP server");
                    HttpServer::new(move || {
                        let project_auth = HttpAuthentication::bearer(auth::project_validator);
                        let project_ingestion_auth =
                            HttpAuthentication::bearer(auth::project_ingestion_validator);

                        App::new()
                            .wrap(ErrorHandlers::new().handler(
                                StatusCode::BAD_REQUEST,
                                |res: dev::ServiceResponse| {
                                    log::error!("Bad request: {:?}", res.response().body());
                                    Ok(ErrorHandlerResponse::Response(res.map_into_left_body()))
                                },
                            ))
                            .wrap(Logger::default().exclude("/health").exclude("/ready"))
                            .wrap(NormalizePath::trim())
                            .app_data(JsonConfig::default().limit(http_payload_limit))
                            .app_data(PayloadConfig::new(http_payload_limit))
                            .app_data(web::Data::from(cache_for_http.clone()))
                            .app_data(web::Data::from(db_for_http.clone()))
                            .app_data(web::Data::new(mq_for_http.clone()))
                            .app_data(web::Data::new(clickhouse_for_http.clone()))
                            .app_data(web::Data::new(clickhouse_readonly_client.clone()))
                            .app_data(web::Data::new(name_generator.clone()))
                            .app_data(web::Data::new(storage_for_http.clone()))
                            .app_data(web::Data::new(query_engine.clone()))
                            .app_data(web::Data::new(sse_connections_for_http.clone()))
                            .app_data(web::Data::new(quickwit_client.clone()))
                            .app_data(web::Data::new(pubsub.clone()))
                            // Ingestion endpoints allow both default and ingest-only keys
                            .service(
                                web::scope("/v1/browser-sessions").service(
                                    web::scope("")
                                        .wrap(project_ingestion_auth.clone())
                                        .service(api::v1::browser_sessions::create_session_event),
                                ),
                            )
                            .service(
                                web::scope("/v1/traces")
                                    .wrap(project_ingestion_auth.clone())
                                    .service(api::v1::traces::process_traces),
                            )
                            .service(
                                web::scope("/v1/metrics")
                                    .wrap(project_ingestion_auth.clone())
                                    .service(api::v1::metrics::process_metrics),
                            )
                            // Default endpoints block ingest-only keys
                            .service(
                                web::scope("/v1/tag")
                                    .wrap(project_auth.clone())
                                    .service(api::v1::tag::tag_trace),
                            )
                            .service(
                                web::scope("/v1")
                                    .wrap(project_auth.clone())
                                    .service(api::v1::datasets::get_datasets)
                                    .service(api::v1::datasets::get_datapoints)
                                    .service(api::v1::datasets::create_datapoints)
                                    .service(api::v1::datasets::get_parquet)
                                    .service(api::v1::evals::init_eval)
                                    .service(api::v1::evals::save_eval_datapoints)
                                    .service(api::v1::evals::update_eval_datapoint)
                                    .service(api::v1::evaluators::create_evaluator_score)
                                    .service(api::v1::sql::execute_sql_query)
                                    .service(api::v1::payloads::get_payload)
                                    .service(api::v1::rollouts::stream)
                                    .service(api::v1::rollouts::update_status)
                                    .service(api::v1::rollouts::send_span_update)
                                    .service(api::v1::rollouts::delete),
                            )
                            .service(
                                // auth on path projects/{project_id} is handled by middleware on Next.js
                                web::scope("/api/v1/projects/{project_id}")
                                    .service(routes::evaluations::get_evaluation_score_stats)
                                    .service(routes::evaluations::get_evaluation_score_distribution)
                                    .service(routes::spans::create_span)
                                    .service(routes::sql::execute_sql_query)
                                    .service(routes::sql::validate_sql_query)
                                    .service(routes::sql::sql_to_json)
                                    .service(routes::sql::json_to_sql)
                                    .service(routes::spans::search_spans)
                                    .service(routes::rollouts::run)
                                    .service(routes::rollouts::update_status)
                                    .service(routes::trace_analysis::submit_trace_analysis_job),
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
                    log::info!("Spinning up gRPC server");

                    let process_traces_service = ProcessTracesService::new(
                        db.clone(),
                        cache.clone(),
                        clickhouse.clone(),
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
    }

    for handle in handles {
        log::debug!(
            "Waiting for thread {} to finish",
            handle.thread().name().unwrap()
        );
        handle.join().expect("thread is not panicking")?;
    }
    Ok(())
}
